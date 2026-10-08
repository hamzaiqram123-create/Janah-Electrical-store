import SafariServices
import UIKit
import WebKit

/// The store in a full-screen web view. The site itself handles the safe areas (viewport-fit=cover), its
/// own back button and the bottom navigation; this controller adds what a web page can't do on its own.
final class StoreViewController: UIViewController {
    private var webView: WKWebView!
    private let loading = LoadingView()
    private let errorView = ErrorView()
    private var failedURL: URL?
    private var downloadTarget: URL?

    /// Links that belong in the customer's other apps rather than inside the store.
    private static let externalHosts: Set<String> = [
        "wa.me", "api.whatsapp.com", "maps.apple.com", "maps.google.com", "maps.app.goo.gl", "goo.gl",
        "instagram.com", "www.instagram.com", "x.com", "twitter.com", "www.tiktok.com", "www.snapchat.com",
        "apps.apple.com", "play.google.com",
    ]

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Brand.graphite // shows behind the status bar, matching the store's header

        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = "Mobile/15E148 JanahApp/\(StoreConfig.version) (ios)"
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []
        let content = WKUserContentController()
        content.add(WeakMessageHandler(self), name: "janah")
        // window.print() does nothing in an app's web view: hand it to the iOS print sheet (print or save as PDF)
        content.addUserScript(WKUserScript(
            source: "window.print = function () { window.webkit.messageHandlers.janah.postMessage({ type: 'print' }); };",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController = content

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true // swipe from the edge to go back
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = Brand.graphite
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        let refresh = UIRefreshControl()
        refresh.tintColor = Brand.copper
        refresh.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        errorView.isHidden = true
        errorView.retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)

        for v in [webView!, errorView, loading] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(v)
        }
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            // below the status bar / notch; down to the bottom edge (the page pads for the home indicator)
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
        ])
        for overlay in [errorView, loading] as [UIView] {
            NSLayoutConstraint.activate([
                overlay.topAnchor.constraint(equalTo: view.topAnchor),
                overlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
                overlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
                overlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            ])
        }

        loading.start()
        webView.load(URLRequest(url: StoreConfig.startURL))
    }

    // MARK: actions

    @objc private func pullToRefresh() {
        if webView.url == nil { webView.load(URLRequest(url: StoreConfig.startURL)) } else { webView.reload() }
    }

    @objc private func retry() {
        errorView.isHidden = true
        loading.start()
        webView.load(URLRequest(url: failedURL ?? StoreConfig.startURL))
    }

    private func showError(for url: URL?, offline: Bool) {
        webView.scrollView.refreshControl?.endRefreshing()
        failedURL = url
        errorView.configure(offline: offline)
        errorView.isHidden = false
        view.bringSubviewToFront(errorView)
        if !loading.isHidden { loading.finish() }
    }

    /// Web pages outside the store open in an in-app Safari sheet; phone, mail, WhatsApp and maps in their apps.
    private func openOutside(_ url: URL) {
        let scheme = url.scheme?.lowercased() ?? ""
        if (scheme == "https" || scheme == "http") && !isExternalApp(url) {
            let safari = SFSafariViewController(url: url)
            safari.preferredControlTintColor = Brand.copper
            present(safari, animated: true)
        } else {
            UIApplication.shared.open(url)
        }
    }

    private func isExternalApp(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return Self.externalHosts.contains(host) || (host.hasPrefix("www.google.") && url.path.hasPrefix("/maps"))
    }

    private func printPage() {
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = webView.title ?? "Janah Al Riyada"
        let printer = UIPrintInteractionController.shared
        printer.printInfo = info
        printer.printFormatter = webView.viewPrintFormatter()
        if traitCollection.userInterfaceIdiom == .pad {
            printer.present(from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1), in: view, animated: true, completionHandler: nil)
        } else {
            printer.present(animated: true, completionHandler: nil)
        }
    }

    private func share(_ file: URL) {
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
        present(sheet, animated: true)
    }
}

// MARK: - navigation

extension StoreViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else { return decisionHandler(.allow) }
        if action.shouldPerformDownload { return decisionHandler(.download) }
        switch scheme {
        case "http", "https":
            if isExternalApp(url) {
                UIApplication.shared.open(url)
                return decisionHandler(.cancel)
            }
            // a link tapped on a store page that leads to another site: Safari sheet, the store stays where it was.
            // Redirects (the payment provider's page and its return to the store) stay in the app.
            let fromStore = webView.url.map(StoreConfig.isStore) ?? true
            if action.navigationType == .linkActivated, action.targetFrame?.isMainFrame == true, fromStore, !StoreConfig.isStore(url) {
                openOutside(url)
                return decisionHandler(.cancel)
            }
            decisionHandler(.allow)
        case "about", "blob", "data":
            decisionHandler(.allow)
        default: // tel:, mailto:, sms:, whatsapp:, maps: …
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if let http = response.response as? HTTPURLResponse {
            let disposition = http.value(forHTTPHeaderField: "Content-Disposition")?.lowercased() ?? ""
            if disposition.hasPrefix("attachment") { return decisionHandler(.download) }
            // the host answers instead of the store: not deployed yet, restarting, or overloaded
            if response.isForMainFrame, let url = http.url, StoreConfig.isStore(url) {
                let noServer = http.statusCode == 404 && http.value(forHTTPHeaderField: "x-render-routing") == "no-server"
                if noServer || [502, 503, 504].contains(http.statusCode) {
                    decisionHandler(.cancel)
                    showError(for: url, offline: false)
                    return
                }
            }
        }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        errorView.isHidden = true
        if !loading.isHidden { loading.finish() }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        if !loading.isHidden { failed(error) }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }

    private func failed(_ error: Error) {
        let e = error as NSError
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        // 102: load stopped on purpose (download, opened elsewhere, error screen already shown)
        if e.domain == "WebKitErrorDomain" && (e.code == 102 || e.code == 204) { return }
        let url = (e.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url
        let offlineCodes = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed,
                            NSURLErrorInternationalRoamingOff, NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed]
        showError(for: url, offline: e.domain == NSURLErrorDomain && offlineCodes.contains(e.code))
    }
}

// MARK: - pop-ups, alerts, new windows

extension StoreViewController: WKUIDelegate {
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target="_blank" / window.open: store pages (e.g. the printable invoice) open in place, others outside
        if let url = action.request.url {
            if StoreConfig.isStore(url) { webView.load(action.request) } else { openOutside(url) }
        }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard presentedViewController == nil else { return completionHandler() }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: L("ok"), style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard presentedViewController == nil else { return completionHandler(false) }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: L("cancel"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: L("ok"), style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}

// MARK: - messages from the page

extension StoreViewController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "print" else { return }
        printPage()
    }
}

/// The content controller keeps its handlers alive; this breaks the cycle with the view controller.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

// MARK: - downloads (exports, attachments): saved, then offered in the share sheet (Files, AirDrop, Mail …)

extension StoreViewController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            return completionHandler(nil)
        }
        let target = dir.appendingPathComponent(suggestedFilename.isEmpty ? "download" : suggestedFilename)
        downloadTarget = target
        completionHandler(target)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloadTarget else { return }
        downloadTarget = nil
        share(file)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadTarget = nil
    }
}

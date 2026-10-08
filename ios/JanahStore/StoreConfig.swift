import Foundation

func L(_ key: String) -> String { NSLocalizedString(key, comment: "") }

enum StoreConfig {
    /// The store's address: `JanahStoreURL` in Info.plist, filled from the JANAH_STORE_URL build setting
    /// (the GitHub build takes it from android/twa.json so all apps open the same site).
    /// `--store-url <url>` on the launch command line overrides it; the GitHub build uses that to point the
    /// simulator at a local copy of the store for its checks and screenshots.
    static let baseURL: URL = {
        if let override = argument("--store-url"), let url = URL(string: override) { return url }
        let raw = (Bundle.main.object(forInfoDictionaryKey: "JanahStoreURL") as? String) ?? ""
        return URL(string: raw) ?? URL(string: "https://janah-alriyadah-store.onrender.com")!
    }()

    /// The store's language that matches the phone's: Arabic, English or Urdu (Arabic otherwise).
    static var language: String {
        for id in Locale.preferredLanguages {
            let code = String(id.prefix(2)).lowercased()
            if ["ar", "en", "ur"].contains(code) { return code }
        }
        return "ar"
    }

    /// First page. `?source=ios` tells the site it runs inside the app (no "install the app" offers).
    static var startURL: URL {
        let path = argument("--start-path") ?? "/\(language)"
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var c = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        c.path = parts[0]
        var items = parts.count > 1 ? (URLComponents(string: "?" + parts[1])?.queryItems ?? []) : []
        items.append(URLQueryItem(name: "source", value: "ios"))
        c.queryItems = items
        return c.url ?? baseURL
    }

    static func isStore(_ url: URL) -> Bool {
        url.scheme == baseURL.scheme && url.host == baseURL.host && url.port == baseURL.port
    }

    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "1.0"
    }

    private static func argument(_ name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }
}

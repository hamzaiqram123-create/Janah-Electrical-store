import UIKit

enum Brand {
    static let graphite = UIColor(red: 0x17 / 255.0, green: 0x20 / 255.0, blue: 0x2A / 255.0, alpha: 1)
    static let copper = UIColor(red: 0xE3 / 255.0, green: 0x9A / 255.0, blue: 0x5B / 255.0, alpha: 1)

    static func font(_ style: UIFont.TextStyle, bold: Bool = false) -> UIFont {
        let base = UIFont.preferredFont(forTextStyle: style)
        guard bold, let d = base.fontDescriptor.withSymbolicTraits(.traitBold) else { return base }
        return UIFont(descriptor: d, size: 0)
    }
}

/// Continues the launch screen (same logo, same place) until the first page has loaded. A sleeping
/// server can take a while to answer, so after a few seconds it says so.
final class LoadingView: UIView {
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let note = UILabel()
    private var slowNote: DispatchWorkItem?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Brand.graphite

        let logo = UIImageView(image: UIImage(named: "LaunchLogo"))
        logo.contentMode = .scaleAspectFit
        logo.isAccessibilityElement = false
        spinner.color = .white
        note.text = L("loading.slow")
        note.textColor = UIColor.white.withAlphaComponent(0.82)
        note.font = Brand.font(.subheadline)
        note.adjustsFontForContentSizeCategory = true
        note.numberOfLines = 0
        note.textAlignment = .center
        note.alpha = 0

        for v in [logo, spinner, note] as [UIView] {
            v.translatesAutoresizingMaskIntoConstraints = false
            addSubview(v)
        }
        NSLayoutConstraint.activate([
            logo.centerXAnchor.constraint(equalTo: centerXAnchor),
            logo.centerYAnchor.constraint(equalTo: centerYAnchor),
            logo.widthAnchor.constraint(equalToConstant: 96),
            logo.heightAnchor.constraint(equalToConstant: 96),
            spinner.topAnchor.constraint(equalTo: logo.bottomAnchor, constant: 32),
            spinner.centerXAnchor.constraint(equalTo: centerXAnchor),
            note.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
            note.centerXAnchor.constraint(equalTo: centerXAnchor),
            note.widthAnchor.constraint(lessThanOrEqualToConstant: 320),
            note.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 32),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func start() {
        isHidden = false
        alpha = 1
        note.alpha = 0
        spinner.startAnimating()
        slowNote?.cancel()
        let work = DispatchWorkItem { [weak self] in
            UIView.animate(withDuration: 0.3) { self?.note.alpha = 1 }
        }
        slowNote = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: work)
    }

    func finish() {
        slowNote?.cancel()
        UIView.animate(withDuration: 0.25, animations: { self.alpha = 0 }, completion: { _ in
            self.isHidden = true
            self.spinner.stopAnimating()
        })
    }
}

/// Shown instead of a blank page when the store can't be loaded.
final class ErrorView: UIView {
    let retryButton = UIButton(type: .system)
    private let icon = UIImageView()
    private let title = UILabel()
    private let message = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Brand.graphite

        icon.tintColor = Brand.copper
        icon.contentMode = .scaleAspectFit
        title.font = Brand.font(.title2, bold: true)
        title.textColor = .white
        message.font = Brand.font(.body)
        message.textColor = UIColor.white.withAlphaComponent(0.82)
        for l in [title, message] {
            l.adjustsFontForContentSizeCategory = true
            l.numberOfLines = 0
            l.textAlignment = .center
        }
        var button = UIButton.Configuration.filled()
        button.title = L("error.retry")
        button.baseBackgroundColor = Brand.copper
        button.baseForegroundColor = Brand.graphite
        button.cornerStyle = .medium
        button.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28, bottom: 12, trailing: 28)
        button.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { attrs in
            var a = attrs
            a.font = Brand.font(.headline, bold: true)
            return a
        }
        retryButton.configuration = button

        let stack = UIStackView(arrangedSubviews: [icon, title, message, retryButton])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.setCustomSpacing(26, after: message)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            icon.heightAnchor.constraint(equalToConstant: 56),
            icon.widthAnchor.constraint(equalToConstant: 72),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 360),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 28),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    func configure(offline: Bool) {
        icon.image = UIImage(systemName: offline ? "wifi.slash" : "exclamationmark.icloud",
                             withConfiguration: UIImage.SymbolConfiguration(pointSize: 46, weight: .regular))
        title.text = L(offline ? "error.offline.title" : "error.down.title")
        message.text = L(offline ? "error.offline.text" : "error.down.text")
    }
}

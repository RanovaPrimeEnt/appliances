import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let homeURL = URL(string: "https://ranovaprimeent.github.io/appliances/rpe-v2/?source=ios")!
    private var recoveryView: UIView?
    private lazy var webView: WKWebView = {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "RANOVA-iOS/1.0"
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        view.uiDelegate = self
        view.allowsBackForwardNavigationGestures = true
        return view
    }()

    override func loadView() { view = webView }

    override func viewDidLoad() {
        super.viewDidLoad()
        loadMarketplace()
    }

    private func loadMarketplace() {
        recoveryView?.removeFromSuperview()
        recoveryView = nil
        webView.load(URLRequest(url: homeURL, cachePolicy: .reloadRevalidatingCacheData))
    }

    private func showRecovery(_ detail: String) {
        guard recoveryView == nil else { return }
        let container = UIView()
        container.backgroundColor = .systemBackground
        container.translatesAutoresizingMaskIntoConstraints = false

        let title = UILabel()
        title.text = "Unable to open RANOVA"
        title.font = .preferredFont(forTextStyle: .title2)
        title.textAlignment = .center

        let message = UILabel()
        message.text = detail
        message.textColor = .secondaryLabel
        message.numberOfLines = 0
        message.textAlignment = .center

        let retry = UIButton(type: .system)
        retry.setTitle("Try again", for: .normal)
        retry.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retry.addTarget(self, action: #selector(retryMarketplace), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [title, message, retry])
        stack.axis = .vertical
        stack.spacing = 20
        stack.alignment = .fill
        stack.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(stack)
        webView.addSubview(container)
        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: webView.safeAreaLayoutGuide.topAnchor),
            container.bottomAnchor.constraint(equalTo: webView.safeAreaLayoutGuide.bottomAnchor),
            container.leadingAnchor.constraint(equalTo: webView.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: webView.trailingAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -24)
        ])
        recoveryView = container
    }

    @objc private func retryMarketplace() { loadMarketplace() }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        recoveryView?.removeFromSuperview()
        recoveryView = nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if let scheme = url.scheme?.lowercased(), !["http","https"].contains(scheme) {
            UIApplication.shared.open(url); decisionHandler(.cancel); return
        }
        if let host = url.host?.lowercased(),
           host != "ranovaprimeent.github.io",
           navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        showRecovery("Check your internet connection and try again.")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code == NSURLErrorCancelled { return }
        showRecovery("The marketplace could not finish loading. Please try again.")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        showRecovery("RANOVA stopped unexpectedly. Tap Try again to reload the marketplace.")
    }
}

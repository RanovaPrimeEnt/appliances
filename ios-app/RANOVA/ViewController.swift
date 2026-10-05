import UIKit
import WebKit

final class ViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let homeURL = URL(string: "https://ranovaprimeent.github.io/appliances/rpe-v2/?source=ios")!
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
        webView.load(URLRequest(url: homeURL))
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
        webView.loadHTMLString("<meta name='viewport' content='width=device-width,initial-scale=1'><body style='font-family:-apple-system;padding:32px;text-align:center'><h2>RANOVA is offline</h2><p>Check your internet connection and reopen the app.</p></body>", baseURL: nil)
    }
}

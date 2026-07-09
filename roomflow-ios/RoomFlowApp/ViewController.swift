import UIKit
import WebKit
import ARKit

class ViewController: UIViewController, WKScriptMessageHandler, SpatialEngineDelegate {
    
    var webView: WKWebView!
    var arView: ARSCNView?
    var spatialEngine: SpatialEngine?
    
    // UI HUD Controls for native overlay
    var reticleView: UIView?
    var distanceLabel: UILabel?
    var instructionLabel: UILabel?
    var pinButton: UIButton?
    var undoButton: UIButton?
    var finishButton: UIButton?
    var heightButton: UIButton?
    var closeButton: UIButton?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupSpatialEngine()
    }
    
    func setupWebView() {
        let contentController = WKUserContentController()
        contentController.add(self, name: "RoomFlowNativeBridge")
        
        let config = WKWebViewConfiguration()
        config.userContentController = contentController
        
        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(webView)
        
        // Target priority: Load locally bundled app assets if present, else fallback to live GitHub Pages
        if let localIndexURL = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(localIndexURL, allowingReadAccessTo: localIndexURL.deletingLastPathComponent())
        } else {
            let liveURL = URL(string: "https://theninjallo.github.io/roomflow/?v=31")!
            webView.load(URLRequest(url: liveURL))
        }
    }
    
    func setupSpatialEngine() {
        spatialEngine = SpatialEngine()
        spatialEngine?.delegate = self
    }
    
    // MARK: - WKScriptMessageHandler
    
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "RoomFlowNativeBridge" else { return }
        guard let messageBody = message.body as? String else { return }
        
        guard let data = messageBody.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }
        
        switch type {
        case "checkAppleSpatialCapabilities":
            let capabilities = SpatialEngine.queryCapabilities()
            sendCallbackToJS(type: "spatialCapabilities", payload: capabilities)
            
        case "startAppleSpatialSession":
            let payload = json["payload"] as? [String: Any]
            let levelId = payload?["levelId"] as? String ?? "basement"
            startNativeARSession(levelId: levelId)
            
        case "stopAppleSpatialSession":
            stopNativeARSession()
            
        case "pinPoint":
            spatialEngine?.pinCurrentPoint()
            
        case "undoLastPoint":
            spatialEngine?.undoLastPoint()
            
        case "resetScan":
            spatialEngine?.resetScan()
            
        case "finishRoomScan":
            stopNativeARSession()
            
        case "measureHeight":
            spatialEngine?.measureVerticalHeight()
            
        default:
            break
        }
    }
    
    // MARK: - Native AR HUD UI overlays
    
    func startNativeARSession(levelId: String) {
        // Build ARSCNView
        let arView = ARSCNView(frame: view.bounds)
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(arView)
        self.arView = arView
        
        spatialEngine?.arSession = arView.session
        spatialEngine?.startSession(levelId: levelId)
        
        setupHUDControls()
        webView.isHidden = true
    }
    
    func stopNativeARSession() {
        spatialEngine?.stopSession()
        
        arView?.removeFromSuperview()
        arView = nil
        
        reticleView?.removeFromSuperview()
        distanceLabel?.removeFromSuperview()
        instructionLabel?.removeFromSuperview()
        pinButton?.removeFromSuperview()
        undoButton?.removeFromSuperview()
        finishButton?.removeFromSuperview()
        heightButton?.removeFromSuperview()
        closeButton?.removeFromSuperview()
        
        webView.isHidden = false
        sendCallbackToJS(type: "sessionEnded", payload: [:])
    }
    
    func setupHUDControls() {
        // Aiming Reticle (center screen)
        let size: CGFloat = 36
        let reticle = UIView(frame: CGRect(x: (view.bounds.width - size)/2, y: (view.bounds.height - size)/2, width: size, height: size))
        reticle.layer.borderColor = UIColor.cyan.cgColor
        reticle.layer.borderWidth = 2
        reticle.layer.cornerRadius = size / 2
        reticle.backgroundColor = .clear
        view.addSubview(reticle)
        self.reticleView = reticle
        
        // Active Distance HUD Card
        let distLabel = UILabel(frame: CGRect(x: 20, y: 60, width: view.bounds.width - 40, height: 44))
        distLabel.backgroundColor = UIColor(white: 0, alpha: 0.75)
        distLabel.layer.cornerRadius = 8
        distLabel.layer.masksToBounds = true
        distLabel.textColor = .cyan
        distLabel.textAlignment = .center
        distLabel.font = UIFont.systemFont(ofSize: 22, weight: .bold)
        distLabel.text = "0' 0\""
        view.addSubview(distLabel)
        self.distanceLabel = distLabel
        
        // Guidance status card
        let instLabel = UILabel(frame: CGRect(x: 20, y: 115, width: view.bounds.width - 40, height: 30))
        instLabel.backgroundColor = UIColor(white: 0, alpha: 0.6)
        instLabel.layer.cornerRadius = 6
        instLabel.layer.masksToBounds = true
        instLabel.textColor = .white
        instLabel.textAlignment = .center
        instLabel.font = UIFont.systemFont(ofSize: 13, weight: .medium)
        instLabel.text = "Scan floor / Point camera at walls"
        view.addSubview(instLabel)
        self.instructionLabel = instLabel
        
        // Interactive Buttons
        let btnH: CGFloat = 50
        let padding: CGFloat = 16
        let width = (view.bounds.width - (padding * 3)) / 2
        
        let pinBtn = UIButton(frame: CGRect(x: padding, y: view.bounds.height - 130, width: width, height: btnH))
        pinBtn.backgroundColor = UIColor.systemGreen
        pinBtn.setTitle("Pin Corner", for: .normal)
        pinBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        pinBtn.layer.cornerRadius = 10
        pinBtn.addTarget(self, action: #selector(pinBtnPressed), for: .touchUpInside)
        view.addSubview(pinBtn)
        self.pinButton = pinBtn
        
        let undoBtn = UIButton(frame: CGRect(x: width + (padding * 2), y: view.bounds.height - 130, width: width, height: btnH))
        undoBtn.backgroundColor = UIColor.systemRed
        undoBtn.setTitle("Undo Last", for: .normal)
        undoBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        undoBtn.layer.cornerRadius = 10
        undoBtn.addTarget(self, action: #selector(undoBtnPressed), for: .touchUpInside)
        view.addSubview(undoBtn)
        self.undoButton = undoBtn
        
        let finishBtn = UIButton(frame: CGRect(x: padding, y: view.bounds.height - 70, width: width, height: btnH))
        finishBtn.backgroundColor = UIColor.systemBlue
        finishBtn.setTitle("Create Room", for: .normal)
        finishBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .bold)
        finishBtn.layer.cornerRadius = 10
        finishBtn.addTarget(self, action: #selector(finishBtnPressed), for: .touchUpInside)
        view.addSubview(finishBtn)
        self.finishButton = finishBtn
        
        let heightBtn = UIButton(frame: CGRect(x: width + (padding * 2), y: view.bounds.height - 70, width: width, height: btnH))
        heightBtn.backgroundColor = UIColor.systemOrange
        heightBtn.setTitle("Measure Height", for: .normal)
        heightBtn.titleLabel?.font = UIFont.systemFont(ofSize: 16, weight: .semibold)
        heightBtn.layer.cornerRadius = 10
        heightBtn.addTarget(self, action: #selector(heightBtnPressed), for: .touchUpInside)
        view.addSubview(heightBtn)
        self.heightButton = heightBtn
        
        let closeBtn = UIButton(frame: CGRect(x: view.bounds.width - 60, y: 60, width: 44, height: 44))
        closeBtn.setImage(UIImage(systemName: "xmark.circle.fill"), for: .normal)
        closeBtn.tintColor = .white
        closeBtn.addTarget(self, action: #selector(closeBtnPressed), for: .touchUpInside)
        view.addSubview(closeBtn)
        self.closeButton = closeBtn
    }
    
    @objc func pinBtnPressed() {
        spatialEngine?.pinCurrentPoint()
    }
    
    @objc func undoBtnPressed() {
        spatialEngine?.undoLastPoint()
        sendCallbackToJS(type: "pointPinned", payload: ["action": "undo"])
    }
    
    @objc func finishBtnPressed() {
        stopNativeARSession()
    }
    
    @objc func heightBtnPressed() {
        spatialEngine?.measureVerticalHeight()
    }
    
    @objc func closeBtnPressed() {
        stopNativeARSession()
    }
    
    // MARK: - SpatialEngineDelegate callbacks
    
    func spatialEngineDidUpdateTrackingState(state: String) {
        sendCallbackToJS(type: "trackingStateChanged", payload: ["state": state])
        
        DispatchQueue.main.async { [weak self] in
            let prompt = state == "Tracking" ? "Aim at corner point" : state
            self?.instructionLabel?.text = prompt
        }
    }
    
    func spatialEngineDidUpdateReticle(distanceFeet: Float, xMeters: Float, yMeters: Float, zMeters: Float) {
        let payload: [String: Any] = [
            "distanceFeet": distanceFeet,
            "xMeters": xMeters,
            "yMeters": yMeters,
            "zMeters": zMeters
        ]
        sendCallbackToJS(type: "reticlePoseChanged", payload: payload)
        
        DispatchQueue.main.async { [weak self] in
            let totalInches = Int(round(distanceFeet * 12))
            let f = totalInches / 12
            let i = totalInches % 12
            self?.distanceLabel?.text = "\(f)' \(i)\""
        }
    }
    
    func spatialEngineDidPinPoint(point: [String: Any]) {
        sendCallbackToJS(type: "pointPinned", payload: point)
    }
    
    func spatialEngineDidMeasureHeight(heightFeet: Float) {
        let payload: [String: Any] = [
            "heightFeet": heightFeet
        ]
        sendCallbackToJS(type: "heightMeasured", payload: payload)
    }
    
    func spatialEngineDidReportError(message: String) {
        sendCallbackToJS(type: "sessionError", payload: ["message": message])
    }
    
    // MARK: - WKWebView Javascript evaluator bridge
    
    func sendCallbackToJS(type: String, payload: [String: Any]) {
        let envelope: [String: Any] = [
            "version": 1,
            "type": type,
            "payload": payload
        ]
        
        guard let data = try? JSONSerialization.data(withJSONObject: envelope, options: []),
              let jsonString = String(data: data, encoding: .utf8) else {
            return
        }
        
        let jsCommand = "if (window.RoomFlowNativeBridge && window.RoomFlowNativeBridge.\(type)) { window.RoomFlowNativeBridge.\(type)(\(jsonString)); }"
        
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(jsCommand, completionHandler: nil)
        }
    }
}

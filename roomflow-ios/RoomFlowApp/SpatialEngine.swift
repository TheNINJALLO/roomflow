import Foundation
import ARKit
import SceneKit

protocol SpatialEngineDelegate: AnyObject {
    func spatialEngineDidUpdateTrackingState(state: String)
    func spatialEngineDidUpdateReticle(distanceFeet: Float, xMeters: Float, yMeters: Float, zMeters: Float)
    func spatialEngineDidPinPoint(point: [String: Any])
    func spatialEngineDidMeasureHeight(heightFeet: Float)
    func spatialEngineDidReportError(message: String)
}

class SpatialEngine: NSObject, ARSessionDelegate {
    
    weak var delegate: SpatialEngineDelegate?
    var arSession: ARSession
    
    private var levelId: String = "basement"
    private var activeHitPoint: simd_float4?
    private var pinnedPoints: [simd_float4] = []
    
    private var isLidarActive: Bool = false
    private var isReconstructionActive: Bool = false
    
    override init() {
        self.arSession = ARSession()
        super.init()
        self.arSession.delegate = self
    }
    
    // Check spatial features supported by device
    static func queryCapabilities() -> [String: Bool] {
        let arSupported = ARWorldTrackingConfiguration.isSupported
        var lidarSupported = false
        var sceneReconstructionSupported = false
        var smoothedDepthSupported = false
        
        if arSupported {
            // Scene depth semantics requires LiDAR Scanner (iPhone 12 Pro/iPad Pro 2020 and newer)
            lidarSupported = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
            sceneReconstructionSupported = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
            smoothedDepthSupported = ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
        }
        
        return [
            "arkitSupported": arSupported,
            "lidarSupported": lidarSupported,
            "sceneReconstructionSupported": sceneReconstructionSupported,
            "smoothedDepthSupported": smoothedDepthSupported
        ]
    }
    
    func startSession(levelId: String) {
        self.levelId = levelId
        self.pinnedPoints.removeAll()
        self.activeHitPoint = nil
        
        guard ARWorldTrackingConfiguration.isSupported else {
            delegate?.spatialEngineDidReportError(message: "ARKit is not supported on this device.")
            return
        }
        
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravityAndHeading
        configuration.planeDetection = [.horizontal, .vertical]
        
        // Progressive capability upgrades
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            configuration.frameSemantics.insert(.sceneDepth)
            isLidarActive = true
        }
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            configuration.frameSemantics.insert(.smoothedSceneDepth)
        }
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            configuration.sceneReconstruction = .mesh
            isReconstructionActive = true
        }
        
        arSession.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        delegate?.spatialEngineDidUpdateTrackingState(state: "Initializing")
    }
    
    func stopSession() {
        arSession.pause()
        pinnedPoints.removeAll()
        activeHitPoint = nil
    }
    
    func pinCurrentPoint() {
        guard let point = activeHitPoint else { return }
        pinnedPoints.append(point)
        
        let ptJson: [String: Any] = [
            "id": UUID().uuidString.lowercased(),
            "xMeters": point.x,
            "yMeters": point.y,
            "zMeters": point.z,
            "source": isLidarActive ? "arkit-lidar" : "arkit",
            "timestamp": ISO8601DateFormatter().string(from: Date()),
            "levelId": levelId,
            "depthValidated": isLidarActive
        ]
        delegate?.spatialEngineDidPinPoint(point: ptJson)
    }
    
    func undoLastPoint() {
        if !pinnedPoints.isEmpty {
            pinnedPoints.removeLast()
        }
    }
    
    func resetScan() {
        pinnedPoints.removeAll()
        activeHitPoint = nil
    }
    
    func measureVerticalHeight() {
        // Height = difference between floor plane anchor point and ceiling point
        guard pinnedPoints.count >= 2 else {
            delegate?.spatialEngineDidReportError(message: "Pin at least two points to measure height (floor and ceiling).")
            return
        }
        
        // Assuming user pins floor, then ceiling: height is abs(y2 - y1)
        let first = pinnedPoints[0]
        let last = pinnedPoints[pinnedPoints.count - 1]
        let heightMeters = abs(last.y - first.y)
        let heightFeet = heightMeters * 3.2808399
        
        delegate?.spatialEngineDidMeasureHeight(heightFeet: heightFeet)
    }
    
    // MARK: - ARSessionDelegate
    
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        // 1. Aim reticle from center of screen view frame
        let screenCenter = CGPoint(x: 0.5, y: 0.5)
        
        // 2. Query raycast
        guard let query = session.currentFrame?.raycastQuery(from: screenCenter, allowing: .estimatedPlane, alignment: .any) else {
            return
        }
        
        let results = session.raycast(query)
        if let firstResult = results.first {
            let transform = firstResult.worldTransform
            let hitX = transform.columns.3.x
            let hitY = transform.columns.3.y
            let hitZ = transform.columns.3.z
            
            let hitVector = simd_float4(hitX, hitY, hitZ, 1.0)
            activeHitPoint = hitVector
            
            // Calculate spatial distance from active camera position to target point in meters
            let cameraTransform = frame.camera.transform
            let camX = cameraTransform.columns.3.x
            let camY = cameraTransform.columns.3.y
            let camZ = cameraTransform.columns.3.z
            
            let distanceMeters = sqrt(pow(hitX - camX, 2) + pow(hitY - camY, 2) + pow(hitZ - camZ, 2))
            let distanceFeet = distanceMeters * 3.2808399
            
            delegate?.spatialEngineDidUpdateReticle(
                distanceFeet: distanceFeet,
                xMeters: hitX,
                yMeters: hitY,
                zMeters: hitZ
            )
        }
    }
    
    func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        var stateStr = "Initializing"
        switch camera.trackingState {
        case .notAvailable:
            stateStr = "Lost"
        case .limited(let reason):
            switch reason {
            case .initializing:
                stateStr = "Initializing"
            case .excessiveMotion:
                stateStr = "Limited" // Prompt: 'Move phone slowly'
            case .insufficientFeatures:
                stateStr = "Limited" // Prompt: 'More visual detail needed'
            case .relocalizing:
                stateStr = "Relocalizing"
            @unknown default:
                stateStr = "Limited"
            }
        case .normal:
            stateStr = "Tracking"
        }
        delegate?.spatialEngineDidUpdateTrackingState(state: stateStr)
    }
    
    func session(_ session: ARSession, didFailWithError error: Error) {
        delegate?.spatialEngineDidReportError(message: error.localizedDescription)
    }
}

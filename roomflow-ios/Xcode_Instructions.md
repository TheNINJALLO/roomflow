# Xcode Compilation & Build Instructions: RoomFlow iOS Companion App

This folder contains the complete native Swift source code for the **RoomFlow iOS Companion App**. It embeds the RoomFlow layout designer inside a high-performance `WKWebView` container and overlays an Apple `ARKit` world-tracking and `LiDAR` camera viewfinder using a custom secure bridge.

---

## 🛠 Prerequisites

* A Mac computer running macOS 13 (Ventura) or newer.
* **Xcode 14** or newer (installed from the Mac App Store).
* A physical iOS device:
  * To run **Apple Spatial AR** mode: Any iPhone/iPad running iOS 14 or newer.
  * To run **Apple LiDAR** mode: iPhone Pro / iPad Pro devices equipped with the hardware LiDAR Scanner (e.g., iPhone 12 Pro, 13 Pro, 14 Pro, 15 Pro, 16 Pro, or iPad Pro 2020 and newer).

---

## 🚀 Setup & Launch Steps

### 1. Create a New Xcode Project
Because RoomFlow does not require external CocoaPods/Swift Package Manager dependencies, you can create the Xcode workspace wrapper project in 1 minute:
1. Open **Xcode** on your Mac.
2. Select **File > New > Project...**.
3. Select **iOS > App** and click **Next**.
4. Configure the project:
   * **Product Name:** `RoomFlow`
   * **Organization Identifier:** `com.roomflow`
   * **Interface:** `Storyboard`
   * **Language:** `Swift`
5. Click **Next** and save the project inside this `roomflow-ios` folder.

### 2. Add Swift Source Files to Xcode
1. In Xcode's Left Navigator pane, right-click the `RoomFlow` group folder and choose **Add Files to "RoomFlow"...**.
2. Select the following files from this `RoomFlowApp` folder:
   * [AppDelegate.swift](file:///c:/Users/Ninjo/OneDrive/Desktop/Job%20Tracking/roomflow/roomflow-ios/RoomFlowApp/AppDelegate.swift)
   * [SceneDelegate.swift](file:///c:/Users/Ninjo/OneDrive/Desktop/Job%20Tracking/roomflow/roomflow-ios/RoomFlowApp/SceneDelegate.swift)
   * [ViewController.swift](file:///c:/Users/Ninjo/OneDrive/Desktop/Job%20Tracking/roomflow/roomflow-ios/RoomFlowApp/ViewController.swift)
   * [SpatialEngine.swift](file:///c:/Users/Ninjo/OneDrive/Desktop/Job%20Tracking/roomflow/roomflow-ios/RoomFlowApp/SpatialEngine.swift)
3. Choose **Copy items if needed** and click **Add**.
4. Xcode will ask to replace the default skeleton files. Choose **Replace/Overwrite** for `AppDelegate.swift`, `SceneDelegate.swift`, and `ViewController.swift`.

### 3. Add App Bundle Assets (For Offline Use)
To compile the web assets directly inside the native app bundle for offline deployment at remote construction sites:
1. Drag the entire `roomflow/` web project folder from the workspace (containing `index.html`, `app.js`, `styles.css`, `renderer3d.js`, and `ar-estimator.js`) into Xcode's Project Navigator.
2. Choose **Create Folder References** (instead of Groups).
3. Click **Finish**.

### 4. Configure Camera Permissions & Target Build Settings
1. Select the `RoomFlow` project at the top of the Left Navigator pane.
2. Under the **Info** tab, locate **Custom iOS Target Properties**.
3. Right-click any row and click **Add Row (+)**.
4. Set key to: `Privacy - Camera Usage Description`.
5. Set value to: `We need camera access for Apple ARKit world tracking and LiDAR Scanner measurements.`
6. In **Build Settings**, set the deployment target to **iOS 15.0** or newer.

---

## 📱 Running & Deploying to a Physical iPhone/iPad

1. Connect your physical iPhone or iPad to your Mac via USB.
2. In Xcode's top toolbar, click the active run destination device dropdown and select your connected physical device.
3. Select the **Signing & Capabilities** tab in Xcode.
4. Check **Automatically manage signing** and select your developer account Team.
5. Click the **Run (Play button)** or press `Cmd + R` to compile and deploy.
6. Once deployed to the device, go to **Settings > General > VPN & Device Management** on your iOS device, select your developer certificate, and tap **Trust**.
7. Tap the **RoomFlow** icon on your screen to open the layout design suite with full Apple LiDAR features unlocked!

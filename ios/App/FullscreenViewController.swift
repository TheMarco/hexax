import UIKit
import Capacitor

class FullscreenViewController: CAPBridgeViewController {
    override var prefersStatusBarHidden: Bool { return true }
    override var prefersHomeIndicatorAutoHidden: Bool { return true }
}

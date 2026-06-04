import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NSLog("[ios:app-delegate] didFinishLaunching start")

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "MorthHackathon",
      in: window,
      launchOptions: launchOptions
    )

    NSLog("[ios:app-delegate] didFinishLaunching complete")

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    NSLog("[ios:react-native] sourceURL requested")
    return self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    NSLog("[ios:react-native] using debug bundle")
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    NSLog("[ios:react-native] using release bundle")
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

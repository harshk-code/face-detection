import Foundation
import React

@objc(NativeTrace)
class NativeTrace: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(log:payload:)
  func log(_ event: NSString, payload: NSString) {
    NSLog("[native-trace:%@] %@", event, payload)
  }
}

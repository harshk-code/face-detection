import Foundation
import React

/**
 * Encrypted (Keychain-backed) persistence for the offline auth-event queue.
 * NOTE: add this file and EventQueueStoreBridge.m to the Xcode target. If the
 * module is not registered, the JS layer falls back to an in-memory queue.
 */
@objc(EventQueueStore)
class EventQueueStore: NSObject {
  private let eventsKey = "local_auth_event_queue_json"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getEvents:rejecter:)
  func getEvents(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(KeychainItem.read(eventsKey) ?? NSNull())
  }

  @objc(saveEvents:resolver:rejecter:)
  func saveEvents(
    _ eventsJson: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    KeychainItem.write(eventsJson as String, for: eventsKey)
    resolve(true)
  }

  @objc(clearEvents:rejecter:)
  func clearEvents(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    KeychainItem.delete(eventsKey)
    resolve(true)
  }
}

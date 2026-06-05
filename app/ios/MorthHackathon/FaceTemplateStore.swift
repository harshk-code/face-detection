import Foundation
import React

@objc(FaceTemplateStore)
class FaceTemplateStore: NSObject {
  private let syncQueueKey = "offline_api_sync_queue_json"
  private let templateKey = "local_face_template_json"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(getTemplate:rejecter:)
  func getTemplate(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(UserDefaults.standard.string(forKey: templateKey) ?? NSNull())
  }

  @objc(saveTemplate:resolver:rejecter:)
  func saveTemplate(
    _ templateJson: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    UserDefaults.standard.set(templateJson as String, forKey: templateKey)
    resolve(true)
  }

  @objc(clearTemplate:rejecter:)
  func clearTemplate(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    UserDefaults.standard.removeObject(forKey: templateKey)
    resolve(true)
  }

  @objc(getSyncQueue:rejecter:)
  func getSyncQueue(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(UserDefaults.standard.string(forKey: syncQueueKey) ?? NSNull())
  }

  @objc(saveSyncQueue:resolver:rejecter:)
  func saveSyncQueue(
    _ queueJson: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    UserDefaults.standard.set(queueJson as String, forKey: syncQueueKey)
    resolve(true)
  }

  @objc(clearSyncQueue:rejecter:)
  func clearSyncQueue(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    UserDefaults.standard.removeObject(forKey: syncQueueKey)
    resolve(true)
  }
}

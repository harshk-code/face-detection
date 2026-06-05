import Foundation
import React
import Security

/**
 * Stores the biometric face template in the iOS Keychain (encrypted) instead of
 * plaintext UserDefaults. Migrates any legacy UserDefaults value on first read.
 */
@objc(FaceTemplateStore)
class FaceTemplateStore: NSObject {
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
    migrateLegacyIfNeeded()
    resolve(KeychainItem.read(templateKey) ?? NSNull())
  }

  @objc(saveTemplate:resolver:rejecter:)
  func saveTemplate(
    _ templateJson: NSString,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    KeychainItem.write(templateJson as String, for: templateKey)
    resolve(true)
  }

  @objc(clearTemplate:rejecter:)
  func clearTemplate(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    KeychainItem.delete(templateKey)
    resolve(true)
  }

  private func migrateLegacyIfNeeded() {
    guard KeychainItem.read(templateKey) == nil,
          let legacy = UserDefaults.standard.string(forKey: templateKey)
    else {
      return
    }
    KeychainItem.write(legacy, for: templateKey)
    UserDefaults.standard.removeObject(forKey: templateKey)
  }
}

/// Minimal Keychain wrapper for string values (generic password items).
enum KeychainItem {
  static func read(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var item: CFTypeRef?
    guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
          let data = item as? Data
    else {
      return nil
    }
    return String(data: data, encoding: .utf8)
  }

  static func write(_ value: String, for key: String) {
    delete(key)
    let attributes: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: key,
      kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    SecItemAdd(attributes as CFDictionary, nil)
  }

  static func delete(_ key: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)
  }
}

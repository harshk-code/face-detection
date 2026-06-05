package com.morthhackathon

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FaceTemplateStoreModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val preferences by lazy {
    val prefs = SecurePrefs.get(reactContext, "face_template_store_secure")
    // Migrate any plaintext template written by an earlier app version.
    SecurePrefs.migrateLegacyValue(reactContext, "face_template_store", TEMPLATE_KEY, prefs)
    prefs
  }

  override fun getName(): String = "FaceTemplateStore"

  @ReactMethod
  fun getTemplate(promise: Promise) {
    promise.resolve(preferences.getString(TEMPLATE_KEY, null))
  }

  @ReactMethod
  fun saveTemplate(templateJson: String, promise: Promise) {
    preferences.edit().putString(TEMPLATE_KEY, templateJson).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun clearTemplate(promise: Promise) {
    preferences.edit().remove(TEMPLATE_KEY).apply()
    promise.resolve(true)
  }

  private companion object {
    const val TEMPLATE_KEY = "local_face_template_json"
  }
}

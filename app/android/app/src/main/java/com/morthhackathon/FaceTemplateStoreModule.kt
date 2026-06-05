package com.morthhackathon

import android.content.Context
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class FaceTemplateStoreModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val preferences =
      reactContext.getSharedPreferences("face_template_store", Context.MODE_PRIVATE)

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

package com.morthhackathon

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Encrypted persistence for the offline auth-event queue (single JSON blob). */
class EventQueueStoreModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val preferences by lazy {
    SecurePrefs.get(reactContext, "event_queue_store_secure")
  }

  override fun getName(): String = "EventQueueStore"

  @ReactMethod
  fun getEvents(promise: Promise) {
    promise.resolve(preferences.getString(EVENTS_KEY, null))
  }

  @ReactMethod
  fun saveEvents(eventsJson: String, promise: Promise) {
    preferences.edit().putString(EVENTS_KEY, eventsJson).apply()
    promise.resolve(true)
  }

  @ReactMethod
  fun clearEvents(promise: Promise) {
    preferences.edit().remove(EVENTS_KEY).apply()
    promise.resolve(true)
  }

  private companion object {
    const val EVENTS_KEY = "local_auth_event_queue_json"
  }
}

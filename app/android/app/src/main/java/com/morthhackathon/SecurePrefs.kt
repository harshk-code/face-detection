package com.morthhackathon

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Provides AES-256 encrypted SharedPreferences backed by an Android Keystore
 * master key, so biometric templates and queued auth events are never stored in
 * plaintext on disk.
 *
 * If the Keystore is unavailable on a device (rare, but possible after a backup
 * restore or on a broken vendor image), it falls back to plaintext prefs so the
 * app keeps working rather than crashing — the JS layer logs the difference.
 */
object SecurePrefs {
  private const val TAG = "SecurePrefs"

  fun get(context: Context, fileName: String): SharedPreferences {
    return try {
      val masterKey =
          MasterKey.Builder(context)
              .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
              .build()
      EncryptedSharedPreferences.create(
          context,
          fileName,
          masterKey,
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
      )
    } catch (error: Throwable) {
      Log.e(TAG, "EncryptedSharedPreferences unavailable; using plaintext fallback", error)
      context.getSharedPreferences("${fileName}_fallback", Context.MODE_PRIVATE)
    }
  }

  /**
   * One-time migration of a value from a legacy plaintext prefs file into the
   * encrypted store, then removes the plaintext copy.
   */
  fun migrateLegacyValue(
      context: Context,
      legacyFile: String,
      key: String,
      target: SharedPreferences,
  ) {
    if (target.contains(key)) {
      return
    }
    val legacy = context.getSharedPreferences(legacyFile, Context.MODE_PRIVATE)
    val value = legacy.getString(key, null) ?: return
    target.edit().putString(key, value).apply()
    legacy.edit().remove(key).apply()
    Log.i(TAG, "migrated $key from $legacyFile into encrypted store")
  }
}

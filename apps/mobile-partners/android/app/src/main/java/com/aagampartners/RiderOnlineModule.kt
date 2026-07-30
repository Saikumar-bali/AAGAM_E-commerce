package com.aagampartners

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class RiderOnlineModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AagamRiderOnline"

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    try {
      val riderName = if (options.hasKey("riderName")) options.getString("riderName") ?: "Rider" else "Rider"
      val apiUrl = if (options.hasKey("apiUrl")) options.getString("apiUrl") ?: "" else ""
      val authToken = if (options.hasKey("authToken")) options.getString("authToken") ?: "" else ""
      if (apiUrl.isBlank() || authToken.isBlank()) {
        promise.reject("RIDER_ONLINE_CONFIGURATION_MISSING", "API URL and mobile bearer token are required")
        return
      }

      requestBatteryOptimisationExemption()
      val intent = Intent(reactContext, RiderOnlineService::class.java).apply {
        action = RiderOnlineService.ACTION_START
        putExtra(RiderOnlineService.EXTRA_RIDER_NAME, riderName)
        putExtra(RiderOnlineService.EXTRA_API_URL, apiUrl)
        putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)
      }
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactContext, RiderOnlineService::class.java).apply {
        action = RiderOnlineService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(
        RiderOnlineService.PREFS_NAME,
        android.content.Context.MODE_PRIVATE,
      )
      val result = Arguments.createMap().apply {
        putBoolean("supported", true)
        putBoolean("active", prefs.getBoolean(RiderOnlineService.KEY_ACTIVE, false))
        putString("riderName", prefs.getString(RiderOnlineService.KEY_RIDER_NAME, null))
        putString("lastSentAt", prefs.getString(RiderOnlineService.KEY_LAST_SENT_AT, null))
        putString("lastError", prefs.getString(RiderOnlineService.KEY_LAST_ERROR, null))
        putBoolean("batteryOptimisationExempt", isIgnoringBatteryOptimisations())
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_STATUS_FAILED", error.message, error)
    }
  }

  private fun requestBatteryOptimisationExemption() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    if (isIgnoringBatteryOptimisations()) return
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      try {
        val settingsIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(settingsIntent)
      } catch (_: Exception) {
        // The user can enable the exemption manually.
      }
    }
  }

  private fun isIgnoringBatteryOptimisations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }
}

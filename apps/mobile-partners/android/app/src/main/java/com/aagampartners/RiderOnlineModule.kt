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

  /**
   * Start the foreground service that keeps the app alive while the rider is online.
   * Also requests battery-optimisation exemption on first call.
   */
  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    try {
      val riderName = if (options.hasKey("riderName")) options.getString("riderName") ?: "Rider" else "Rider"

      // Best-effort: ask user to exempt from battery optimisation.
      requestBatteryOptimisationExemption()

      val intent = Intent(reactContext, RiderOnlineService::class.java).apply {
        action = RiderOnlineService.ACTION_START
        putExtra("riderName", riderName)
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
        putBoolean("active", prefs.getBoolean("active", false))
        putString("riderName", prefs.getString("riderName", null))
        putBoolean("batteryOptimisationExempt", isIgnoringBatteryOptimisations())
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_STATUS_FAILED", error.message, error)
    }
  }

  /**
   * On Android 6+ request that the user exempt this app from Doze battery
   * optimisation. This is non-blocking — the system dialog is best-effort and
   * the user may dismiss it.
   */
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
      // Some OEMs block this intent; silently ignore.
    }
  }

  private fun isIgnoringBatteryOptimisations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }
}

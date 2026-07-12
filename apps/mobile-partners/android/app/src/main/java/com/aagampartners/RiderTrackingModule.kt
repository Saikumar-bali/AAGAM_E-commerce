package com.aagampartners

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class RiderTrackingModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AagamRiderTracking"

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    try {
      val apiUrl = options.getString("apiUrl") ?: ""
      val authToken = options.getString("authToken") ?: ""
      val orderId = options.getString("orderId") ?: ""
      val deliveryJobId = options.getString("deliveryJobId") ?: ""
      val deliveryStatus = options.getString("deliveryStatus") ?: ""
      val intervalMs = if (options.hasKey("intervalMs")) options.getDouble("intervalMs").toLong() else 20_000L

      if (apiUrl.isBlank() || authToken.isBlank() || orderId.isBlank()) {
        promise.reject("TRACKING_CONFIG_INVALID", "apiUrl, authToken, and orderId are required")
        return
      }

      val intent = Intent(reactContext, RiderTrackingService::class.java).apply {
        action = RiderTrackingService.ACTION_START
        putExtra(RiderTrackingService.EXTRA_API_URL, apiUrl)
        putExtra(RiderTrackingService.EXTRA_AUTH_TOKEN, authToken)
        putExtra(RiderTrackingService.EXTRA_ORDER_ID, orderId)
        putExtra(RiderTrackingService.EXTRA_DELIVERY_JOB_ID, deliveryJobId)
        putExtra(RiderTrackingService.EXTRA_DELIVERY_STATUS, deliveryStatus)
        putExtra(RiderTrackingService.EXTRA_INTERVAL_MS, intervalMs)
      }
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("TRACKING_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stop(reason: String?, promise: Promise) {
    try {
      val intent = Intent(reactContext, RiderTrackingService::class.java).apply {
        action = RiderTrackingService.ACTION_STOP
        putExtra(RiderTrackingService.EXTRA_STOP_REASON, reason ?: "CLIENT_STOPPED")
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("TRACKING_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(
        RiderTrackingService.PREFS_NAME,
        Context.MODE_PRIVATE,
      )
      val queueRaw = prefs.getString(RiderTrackingService.KEY_QUEUE, null)
      val queuedCount = try {
        if (queueRaw.isNullOrBlank()) 0 else org.json.JSONArray(queueRaw).length()
      } catch (_: Exception) {
        0
      }

      val result = Arguments.createMap().apply {
        putBoolean("supported", true)
        putBoolean("active", prefs.getBoolean(RiderTrackingService.KEY_ACTIVE, false))
        putString("orderId", prefs.getString(RiderTrackingService.KEY_ORDER_ID, null))
        putString("deliveryJobId", prefs.getString(RiderTrackingService.KEY_DELIVERY_JOB_ID, null))
        putString("deliveryStatus", prefs.getString(RiderTrackingService.KEY_DELIVERY_STATUS, null))
        putString("lastSentAt", prefs.getString(RiderTrackingService.KEY_LAST_SENT_AT, null))
        val accuracy = prefs.getFloat(RiderTrackingService.KEY_LAST_ACCURACY, -1f)
        if (accuracy >= 0f) putDouble("lastAccuracy", accuracy.toDouble()) else putNull("lastAccuracy")
        putInt("queuedCount", queuedCount)
        putString("error", prefs.getString(RiderTrackingService.KEY_LAST_ERROR, null))
        putString("stopReason", prefs.getString(RiderTrackingService.KEY_STOP_REASON, null))
        putDouble("sequence", prefs.getLong(RiderTrackingService.KEY_SEQUENCE, 0L).toDouble())
        putInt("androidApiLevel", Build.VERSION.SDK_INT)
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("TRACKING_STATUS_FAILED", error.message, error)
    }
  }
}

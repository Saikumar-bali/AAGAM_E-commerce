package com.aagampartners

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.IBinder
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class RiderTrackingService : Service() {
  companion object {
    const val ACTION_START = "com.aagampartners.tracking.START"
    const val ACTION_STOP = "com.aagampartners.tracking.STOP"
    const val EXTRA_API_URL = "apiUrl"
    const val EXTRA_AUTH_TOKEN = "authToken"
    const val EXTRA_ORDER_ID = "orderId"
    const val EXTRA_DELIVERY_JOB_ID = "deliveryJobId"
    const val EXTRA_DELIVERY_STATUS = "deliveryStatus"
    const val EXTRA_INTERVAL_MS = "intervalMs"
    const val EXTRA_STOP_REASON = "stopReason"

    const val PREFS_NAME = "aagam_rider_tracking"
    const val KEY_ACTIVE = "active"
    const val KEY_API_URL = "apiUrl"
    const val KEY_AUTH_TOKEN = "authToken"
    const val KEY_ORDER_ID = "orderId"
    const val KEY_DELIVERY_JOB_ID = "deliveryJobId"
    const val KEY_DELIVERY_STATUS = "deliveryStatus"
    const val KEY_INTERVAL_MS = "intervalMs"
    const val KEY_SESSION_ID = "sessionId"
    const val KEY_SEQUENCE = "sequence"
    const val KEY_QUEUE = "queue"
    const val KEY_LAST_SENT_AT = "lastSentAt"
    const val KEY_LAST_ACCURACY = "lastAccuracy"
    const val KEY_LAST_ERROR = "lastError"
    const val KEY_STOP_REASON = "stopReason"

    const val CHANNEL_ID = "aagam_delivery_tracking"
    const val NOTIFICATION_ID = 4202
    const val MAX_QUEUE_SIZE = 200
  }

  private lateinit var locationClient: FusedLocationProviderClient
  private val executor = Executors.newSingleThreadExecutor()
  private val flushing = AtomicBoolean(false)
  private var locationCallback: LocationCallback? = null

  override fun onCreate() {
    super.onCreate()
    locationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopTracking(intent.getStringExtra(EXTRA_STOP_REASON) ?: "CLIENT_STOPPED")
        return START_NOT_STICKY
      }
      ACTION_START -> persistConfiguration(intent)
      null -> Unit
    }

    val prefs = preferences()
    if (!prefs.getBoolean(KEY_ACTIVE, false)) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    startLocationUpdates()
    executor.execute { flushQueue() }
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    removeLocationUpdates()
    executor.shutdownNow()
    super.onDestroy()
  }

  private fun persistConfiguration(intent: Intent) {
    val apiUrl = intent.getStringExtra(EXTRA_API_URL)?.trimEnd('/') ?: ""
    val authToken = intent.getStringExtra(EXTRA_AUTH_TOKEN) ?: ""
    val orderId = intent.getStringExtra(EXTRA_ORDER_ID) ?: ""
    val deliveryJobId = intent.getStringExtra(EXTRA_DELIVERY_JOB_ID) ?: ""
    val deliveryStatus = intent.getStringExtra(EXTRA_DELIVERY_STATUS) ?: ""
    val intervalMs = intent.getLongExtra(EXTRA_INTERVAL_MS, 20_000L).coerceAtLeast(5_000L)

    if (apiUrl.isBlank() || authToken.isBlank() || orderId.isBlank()) {
      preferences().edit()
        .putBoolean(KEY_ACTIVE, false)
        .putString(KEY_LAST_ERROR, "Tracking configuration is incomplete")
        .apply()
      return
    }

    val prefs = preferences()
    val existingOrderId = prefs.getString(KEY_ORDER_ID, null)
    val sessionId = if (existingOrderId == orderId) {
      prefs.getString(KEY_SESSION_ID, null) ?: UUID.randomUUID().toString()
    } else {
      UUID.randomUUID().toString()
    }

    prefs.edit()
      .putBoolean(KEY_ACTIVE, true)
      .putString(KEY_API_URL, apiUrl)
      .putString(KEY_AUTH_TOKEN, authToken)
      .putString(KEY_ORDER_ID, orderId)
      .putString(KEY_DELIVERY_JOB_ID, deliveryJobId)
      .putString(KEY_DELIVERY_STATUS, deliveryStatus)
      .putLong(KEY_INTERVAL_MS, intervalMs)
      .putString(KEY_SESSION_ID, sessionId)
      .putLong(KEY_SEQUENCE, if (existingOrderId == orderId) prefs.getLong(KEY_SEQUENCE, 0L) else 0L)
      .putString(KEY_LAST_ERROR, null)
      .putString(KEY_STOP_REASON, null)
      .apply()
  }

  private fun startLocationUpdates() {
    if (locationCallback != null) return
    val fineGranted = ActivityCompat.checkSelfPermission(
      this,
      Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = ActivityCompat.checkSelfPermission(
      this,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    if (!fineGranted && !coarseGranted) {
      recordError("Location permission is not granted")
      stopTracking("LOCATION_PERMISSION_MISSING")
      return
    }

    val intervalMs = preferences().getLong(KEY_INTERVAL_MS, 20_000L).coerceAtLeast(5_000L)
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis((intervalMs / 2).coerceAtLeast(5_000L))
      .setMinUpdateDistanceMeters(15f)
      .build()

    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let { location -> executor.execute { queueLocation(location) } }
      }
    }
    locationCallback = callback
    locationClient.requestLocationUpdates(request, callback, mainLooper)
      .addOnFailureListener { error ->
        recordError(error.message ?: "Unable to start location updates")
        stopTracking("LOCATION_PROVIDER_FAILED")
      }
  }

  private fun removeLocationUpdates() {
    locationCallback?.let { locationClient.removeLocationUpdates(it) }
    locationCallback = null
  }

  private fun queueLocation(location: Location) {
    val prefs = preferences()
    if (!prefs.getBoolean(KEY_ACTIVE, false)) return

    val nextSequence = prefs.getLong(KEY_SEQUENCE, 0L) + 1L
    val sessionId = prefs.getString(KEY_SESSION_ID, null) ?: UUID.randomUUID().toString()
    val ping = JSONObject()
      .put("orderId", prefs.getString(KEY_ORDER_ID, ""))
      .put("latitude", location.latitude)
      .put("longitude", location.longitude)
      .put("accuracy", if (location.hasAccuracy()) location.accuracy.toDouble() else JSONObject.NULL)
      .put("speed", if (location.hasSpeed()) location.speed.toDouble() else JSONObject.NULL)
      .put("heading", if (location.hasBearing()) location.bearing.toDouble() else JSONObject.NULL)
      .put("source", "ANDROID_FOREGROUND_SERVICE")
      .put("clientPingId", "$sessionId-$nextSequence")
      .put("sequence", nextSequence)
      .put("capturedAt", Instant.ofEpochMilli(location.time).toString())

    val queue = readQueue()
    queue.put(ping)
    val bounded = JSONArray()
    val start = (queue.length() - MAX_QUEUE_SIZE).coerceAtLeast(0)
    for (index in start until queue.length()) bounded.put(queue.getJSONObject(index))

    prefs.edit()
      .putLong(KEY_SEQUENCE, nextSequence)
      .putString(KEY_QUEUE, bounded.toString())
      .putFloat(KEY_LAST_ACCURACY, if (location.hasAccuracy()) location.accuracy else -1f)
      .apply()
    flushQueue()
  }

  private fun flushQueue() {
    if (!flushing.compareAndSet(false, true)) return
    try {
      val queue = readQueue()
      if (queue.length() == 0) return

      val remaining = JSONArray()
      var blockedByTransientFailure = false
      for (index in 0 until queue.length()) {
        val ping = queue.getJSONObject(index)
        if (blockedByTransientFailure) {
          remaining.put(ping)
          continue
        }

        when (sendPing(ping)) {
          SendResult.SENT, SendResult.PERMANENT_REJECTION -> Unit
          SendResult.AUTH_FAILURE -> {
            remaining.put(ping)
            for (tail in index + 1 until queue.length()) remaining.put(queue.getJSONObject(tail))
            preferences().edit()
              .putString(KEY_QUEUE, remaining.toString())
              .putString(KEY_LAST_ERROR, "Tracking authorization expired")
              .apply()
            stopTracking("AUTHORIZATION_FAILED")
            return
          }
          SendResult.TRANSIENT_FAILURE -> {
            remaining.put(ping)
            blockedByTransientFailure = true
          }
        }
      }
      preferences().edit().putString(KEY_QUEUE, remaining.toString()).apply()
    } finally {
      flushing.set(false)
    }
  }

  private enum class SendResult { SENT, PERMANENT_REJECTION, AUTH_FAILURE, TRANSIENT_FAILURE }

  private fun sendPing(ping: JSONObject): SendResult {
    val prefs = preferences()
    val apiUrl = prefs.getString(KEY_API_URL, "") ?: ""
    val token = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
    if (apiUrl.isBlank() || token.isBlank()) return SendResult.AUTH_FAILURE

    var connection: HttpURLConnection? = null
    return try {
      connection = URL("$apiUrl/tracking/rider-location").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 15_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.outputStream.use { output -> output.write(ping.toString().toByteArray(Charsets.UTF_8)) }

      val responseCode = connection.responseCode
      when {
        responseCode in 200..299 -> {
          prefs.edit()
            .putString(KEY_LAST_SENT_AT, Instant.now().toString())
            .putString(KEY_LAST_ERROR, null)
            .apply()
          SendResult.SENT
        }
        responseCode == 401 || responseCode == 403 -> SendResult.AUTH_FAILURE
        responseCode in 400..499 -> {
          recordError("Tracking ping rejected with HTTP $responseCode")
          SendResult.PERMANENT_REJECTION
        }
        else -> {
          recordError("Tracking server returned HTTP $responseCode")
          SendResult.TRANSIENT_FAILURE
        }
      }
    } catch (error: Exception) {
      recordError(error.message ?: "Tracking network request failed")
      SendResult.TRANSIENT_FAILURE
    } finally {
      connection?.disconnect()
    }
  }

  private fun stopTracking(reason: String) {
    removeLocationUpdates()
    preferences().edit()
      .putBoolean(KEY_ACTIVE, false)
      .putString(KEY_STOP_REASON, reason)
      .apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun readQueue(): JSONArray {
    val raw = preferences().getString(KEY_QUEUE, null)
    return try {
      if (raw.isNullOrBlank()) JSONArray() else JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun recordError(message: String) {
    preferences().edit().putString(KEY_LAST_ERROR, message.take(500)).apply()
  }

  private fun preferences() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Delivery tracking",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Keeps rider location active during an assigned delivery"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): android.app.Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val orderId = preferences().getString(KEY_ORDER_ID, null)
    val suffix = orderId?.takeLast(8)?.uppercase() ?: "ACTIVE"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("AAGAM delivery tracking active")
      .setContentText("Tracking order #$suffix while delivery is in progress")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(pendingIntent)
      .build()
  }
}

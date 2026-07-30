package com.aagampartners

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native foreground service for Rider availability.
 *
 * The service owns GPS heartbeats rather than relying on a JavaScript timer, so
 * Android START_STICKY/alarm recovery continues refreshing availability even
 * after the React Native activity or process is recreated.
 */
class RiderOnlineService : Service() {
  companion object {
    const val ACTION_START = "com.aagampartners.online.START"
    const val ACTION_STOP = "com.aagampartners.online.STOP"
    const val ACTION_ALARM_TICK = "com.aagampartners.online.ALARM_TICK"

    const val EXTRA_RIDER_NAME = "riderName"
    const val EXTRA_API_URL = "apiUrl"
    const val EXTRA_AUTH_TOKEN = "authToken"

    const val CHANNEL_ID = "aagam_rider_online"
    const val NOTIFICATION_ID = 4201

    const val PREFS_NAME = "aagam_rider_online"
    const val KEY_ACTIVE = "active"
    const val KEY_RIDER_NAME = "riderName"
    const val KEY_API_URL = "apiUrl"
    const val KEY_AUTH_TOKEN = "authToken"
    const val KEY_LAST_SENT_AT = "lastSentAt"
    const val KEY_LAST_ERROR = "lastError"
    const val KEY_STOP_REASON = "stopReason"

    private const val ALARM_REQUEST_CODE = 7701
    private const val ALARM_INTERVAL_MS = 15 * 60 * 1000L
    private const val HEARTBEAT_INTERVAL_MS = 20_000L
    private const val AVAILABILITY_LOCATION_MAX_AGE_MS = 180_000L

    fun scheduleAlarm(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(context, AlarmReceiver::class.java).apply {
        action = ACTION_ALARM_TICK
      }
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val triggerAt = SystemClock.elapsedRealtime() + ALARM_INTERVAL_MS

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            triggerAt,
            pendingIntent,
          )
        } else {
          @Suppress("DEPRECATION")
          alarmManager.set(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            triggerAt,
            pendingIntent,
          )
        }
      } catch (_: SecurityException) {
        // OEM policy may restrict alarms. START_STICKY remains active.
      } catch (_: RuntimeException) {
        // Never crash availability when an OEM alarm implementation fails.
      }
    }

    fun cancelAlarm(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        Intent(context, AlarmReceiver::class.java).apply { action = ACTION_ALARM_TICK },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      alarmManager.cancel(pendingIntent)
    }
  }

  private lateinit var locationClient: FusedLocationProviderClient
  private val executor = Executors.newSingleThreadExecutor()
  private val sending = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var locationCallback: LocationCallback? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    locationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopService("CLIENT_STOPPED")
        return START_NOT_STICKY
      }
      ACTION_START -> persistConfiguration(intent)
      ACTION_ALARM_TICK, null -> Unit
    }

    if (!configurationIsActive()) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWakeLock()
    startLocationUpdates()
    scheduleAlarm(this)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    removeLocationUpdates()
    releaseWakeLock()
    executor.shutdownNow()
    if (preferences().getBoolean(KEY_ACTIVE, false)) scheduleAlarm(this)
    super.onDestroy()
  }

  private fun persistConfiguration(intent: Intent) {
    val riderName = intent.getStringExtra(EXTRA_RIDER_NAME) ?: "Rider"
    val apiUrl = intent.getStringExtra(EXTRA_API_URL)?.trimEnd('/') ?: ""
    val authToken = intent.getStringExtra(EXTRA_AUTH_TOKEN) ?: ""
    if (apiUrl.isBlank() || authToken.isBlank()) {
      preferences().edit()
        .putBoolean(KEY_ACTIVE, false)
        .putString(KEY_LAST_ERROR, "Availability configuration is incomplete")
        .apply()
      return
    }

    preferences().edit()
      .putBoolean(KEY_ACTIVE, true)
      .putString(KEY_RIDER_NAME, riderName)
      .putString(KEY_API_URL, apiUrl)
      .putString(KEY_AUTH_TOKEN, authToken)
      .putString(KEY_LAST_ERROR, null)
      .putString(KEY_STOP_REASON, null)
      .apply()
  }

  private fun configurationIsActive(): Boolean {
    val prefs = preferences()
    return prefs.getBoolean(KEY_ACTIVE, false) &&
      !prefs.getString(KEY_API_URL, "").isNullOrBlank() &&
      !prefs.getString(KEY_AUTH_TOKEN, "").isNullOrBlank()
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
      stopService("LOCATION_PERMISSION_MISSING")
      return
    }
    val backgroundGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ActivityCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION,
      ) == PackageManager.PERMISSION_GRANTED
    if (!backgroundGranted) {
      stopService("BACKGROUND_LOCATION_PERMISSION_MISSING")
      return
    }

    val request = LocationRequest.Builder(
      Priority.PRIORITY_HIGH_ACCURACY,
      HEARTBEAT_INTERVAL_MS,
    )
      .setMinUpdateIntervalMillis(HEARTBEAT_INTERVAL_MS)
      .setMinUpdateDistanceMeters(0f)
      .build()

    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let { location ->
          executor.execute { sendHeartbeat(location) }
        }
      }
    }
    locationCallback = callback
    locationClient.requestLocationUpdates(request, callback, mainLooper)
      .addOnFailureListener { error ->
        recordError(error.message ?: "Unable to start availability location updates")
        stopService("LOCATION_PROVIDER_FAILED")
      }

    locationClient.lastLocation.addOnSuccessListener { location ->
      location?.let { executor.execute { sendHeartbeat(it) } }
    }
  }

  private fun removeLocationUpdates() {
    locationCallback?.let { locationClient.removeLocationUpdates(it) }
    locationCallback = null
  }

  private fun isFreshLocation(location: Location): Boolean {
    val capturedAt = location.time
    if (capturedAt <= 0L) return false
    val ageMs = System.currentTimeMillis() - capturedAt
    return ageMs in 0..AVAILABILITY_LOCATION_MAX_AGE_MS
  }

  private fun sendHeartbeat(location: Location) {
    if (!isFreshLocation(location)) {
      recordError("Ignored stale availability location")
      return
    }
    if (!configurationIsActive() || !sending.compareAndSet(false, true)) return
    val prefs = preferences()
    val apiUrl = prefs.getString(KEY_API_URL, "") ?: ""
    val token = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
    var connection: HttpURLConnection? = null

    try {
      val payload = JSONObject()
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .toString()
        .toByteArray(Charsets.UTF_8)

      connection = URL("$apiUrl/riders/me/heartbeat").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 15_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setFixedLengthStreamingMode(payload.size)
      connection.outputStream.use { it.write(payload) }

      when (val responseCode = connection.responseCode) {
        in 200..299 -> prefs.edit()
          .putString(KEY_LAST_SENT_AT, Instant.now().toString())
          .putString(KEY_LAST_ERROR, null)
          .apply()
        401, 403 -> requestStop("AUTHORIZATION_FAILED")
        409 -> requestStop("SERVER_MARKED_OFFLINE")
        else -> recordError("Availability heartbeat returned HTTP $responseCode")
      }
    } catch (error: Exception) {
      recordError(error.message ?: "Availability heartbeat failed")
    } finally {
      connection?.disconnect()
      sending.set(false)
    }
  }

  private fun requestStop(reason: String) {
    mainHandler.post { stopService(reason) }
  }

  private fun stopService(reason: String) {
    removeLocationUpdates()
    releaseWakeLock()
    cancelAlarm(this)
    preferences().edit()
      .putBoolean(KEY_ACTIVE, false)
      .remove(KEY_API_URL)
      .remove(KEY_AUTH_TOKEN)
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

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "aagam:rider-online",
    ).apply { acquire(12 * 60 * 60 * 1000L) }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun recordError(message: String) {
    preferences().edit().putString(KEY_LAST_ERROR, message.take(500)).apply()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Rider online",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows when you are online and ready to receive delivery offers"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val riderName = preferences().getString(KEY_RIDER_NAME, "Rider") ?: "Rider"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("AAGAM — You are online")
      .setContentText("Ready to receive delivery offers • $riderName")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun preferences() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val prefs = context.getSharedPreferences(RiderOnlineService.PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(RiderOnlineService.KEY_ACTIVE, false)) return

    val serviceIntent = Intent(context, RiderOnlineService::class.java).apply {
      action = RiderOnlineService.ACTION_ALARM_TICK
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    } catch (_: RuntimeException) {
      // Android may restrict background starts; the next allowed alarm/launch retries.
    }
    RiderOnlineService.scheduleAlarm(context)
  }
}

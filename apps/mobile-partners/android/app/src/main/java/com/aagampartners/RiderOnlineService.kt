package com.aagampartners

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the Partners app alive while the rider is ONLINE.
 *
 * Uses three layers of protection against Android battery optimisation:
 * 1. Foreground service with persistent notification (standard)
 * 2. Partial WakeLock (keeps CPU running when screen is off)
 * 3. AlarmManager best-effort wake-up (re-starts the service if the OS kills it)
 *
 * The alarm is deliberately inexact. Exact alarms require privileged Android
 * access on recent releases and are not appropriate for a delivery-app keep-alive.
 */
class RiderOnlineService : Service() {
  companion object {
    const val ACTION_START = "com.aagampartners.online.START"
    const val ACTION_STOP = "com.aagampartners.online.STOP"
    const val ACTION_ALARM_TICK = "com.aagampartners.online.ALARM_TICK"

    const val CHANNEL_ID = "aagam_rider_online"
    const val NOTIFICATION_ID = 4201

    const val PREFS_NAME = "aagam_rider_online"
    private const val KEY_ACTIVE = "active"
    private const val KEY_RIDER_NAME = "riderName"

    private const val ALARM_REQUEST_CODE = 7701
    private const val ALARM_INTERVAL_MS = 15 * 60 * 1000L

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
        // Do not crash the foreground service when an OEM restricts alarms.
      } catch (_: RuntimeException) {
        // Some OEM alarm implementations fail at runtime; FCM and START_STICKY
        // remain the primary recovery mechanisms.
      }
    }

    fun cancelAlarm(context: Context) {
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
      alarmManager.cancel(pendingIntent)
    }
  }

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopService()
        return START_NOT_STICKY
      }
      ACTION_START -> {
        val riderName = intent.getStringExtra("riderName") ?: "Rider"
        preferences().edit()
          .putBoolean(KEY_ACTIVE, true)
          .putString(KEY_RIDER_NAME, riderName)
          .apply()
      }
      ACTION_ALARM_TICK -> {
        if (!preferences().getBoolean(KEY_ACTIVE, false)) {
          stopSelf()
          return START_NOT_STICKY
        }
      }
      null -> {
        if (!preferences().getBoolean(KEY_ACTIVE, false)) {
          stopSelf()
          return START_NOT_STICKY
        }
      }
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWakeLock()
    scheduleAlarm(this)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    releaseWakeLock()
    if (preferences().getBoolean(KEY_ACTIVE, false)) {
      scheduleAlarm(this)
    }
    super.onDestroy()
  }

  private fun stopService() {
    releaseWakeLock()
    cancelAlarm(this)
    preferences().edit().putBoolean(KEY_ACTIVE, false).apply()
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
    ).apply {
      acquire(12 * 60 * 60 * 1000L)
    }
  }

  private fun releaseWakeLock() {
    wakeLock?.let {
      if (it.isHeld) it.release()
    }
    wakeLock = null
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

/**
 * BroadcastReceiver fired by the best-effort keep-alive alarm. If the service
 * was killed while the Rider remained online, the receiver attempts to restore it.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val prefs = context.getSharedPreferences(RiderOnlineService.PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("active", false)) return

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
      // Android may restrict background starts. FCM remains responsible for
      // delivering assignment offers when the app process is not running.
    }

    RiderOnlineService.scheduleAlarm(context)
  }
}

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
 * 3. AlarmManager periodic alarm (re-starts the service every 15 min if killed)
 *
 * On aggressive OEM skins (Xiaomi MIUI, Samsung OneUI, Huawei EMUI), the OS may
 * still kill the foreground service. The periodic alarm is the last line of defence
 * — it fires via AlarmManager.ELAPSED_REALTIME_WAKEUP which survives Doze and
 * app standby, and re-launches the service.
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
    private const val ALARM_INTERVAL_MS = 15 * 60 * 1000L // 15 minutes

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
      alarmManager.setExactAndAllowWhileIdle(
        AlarmManager.ELAPSED_REALTIME_WAKEUP,
        triggerAt,
        pendingIntent,
      )
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
        // Alarm fired — service was likely killed and restarted. Re-persist state.
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
    // Re-schedule alarm if still active — gives the service a chance to restart
    // even after onDestroy on aggressive OEMs.
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
 * BroadcastReceiver that fires every 15 minutes via AlarmManager.
 * If the foreground service was killed by the OS, this receiver restarts it.
 */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val prefs = context.getSharedPreferences(RiderOnlineService.PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("active", false)) return

    // Re-launch the foreground service.
    val serviceIntent = Intent(context, RiderOnlineService::class.java).apply {
      action = RiderOnlineService.ACTION_ALARM_TICK
    }
    try {
      context.startForegroundService(serviceIntent)
    } catch (_: Exception) {
      // Some OEMs restrict background starts; the alarm itself keeps the process alive.
    }

    // Schedule the next alarm.
    RiderOnlineService.scheduleAlarm(context)
  }
}

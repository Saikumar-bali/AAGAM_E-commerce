package com.aagampartners

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/**
 * Foreground service that keeps the Partners app alive while the rider is ONLINE.
 *
 * Android aggressively kills background apps to save battery. A foreground service
 * with an ongoing notification signals the OS that the app is actively in use,
 * preventing it from being killed. A partial WakeLock additionally keeps the CPU
 * running when the screen is off so that incoming FCM offers and location pings
 * are processed promptly.
 *
 * Started from JS via [RiderOnlineModule.start] and stopped via [stop].
 */
class RiderOnlineService : Service() {
  companion object {
    const val ACTION_START = "com.aagampartners.online.START"
    const val ACTION_STOP = "com.aagampartners.online.STOP"

    const val CHANNEL_ID = "aagam_rider_online"
    const val NOTIFICATION_ID = 4201

    private const val PREFS_NAME = "aagam_rider_online"
    private const val KEY_ACTIVE = "active"
    private const val KEY_RIDER_NAME = "riderName"
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
      null -> {
        if (!preferences().getBoolean(KEY_ACTIVE, false)) {
          stopSelf()
          return START_NOT_STICKY
        }
      }
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWakeLock()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    releaseWakeLock()
    super.onDestroy()
  }

  private fun stopService() {
    releaseWakeLock()
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
      acquire(12 * 60 * 60 * 1000L) // 12-hour max; restarted on each onStartCommand
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

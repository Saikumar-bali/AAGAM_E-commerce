package com.aagampartners

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.Color
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages.apply {
        add(RiderTrackingPackage())
        add(RiderOnlinePackage())
        add(FirebasePnvPackage())
        add(PartnerDocumentPickerPackage())
        add(PartnerQrScannerPackage())
        add(PartnerAlertTonePackage())
        add(PartnerConnectivityPackage())
      },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createOperationsNotificationChannel()
    loadReactNative(this)
  }

  private fun createOperationsNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    // Android freezes a channel's sound after first creation, so the id is
    // versioned: v4 moves existing installs to the bundled rider alert sound.
    // Background/killed-state pushes use this channel's sound; foreground
    // alerts play the same `res/raw/rider_alert.wav` asset via PartnerAlertTone.
    val soundUri = Uri.parse("android.resource://$packageName/${R.raw.rider_alert}")
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      OPERATIONS_CHANNEL_ID,
      "Aagaam urgent operations",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "High-priority new orders, rider offers, pickup updates and delivery exceptions"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 320, 120, 320, 120, 520, 180, 320)
      enableLights(true)
      lightColor = Color.rgb(13, 148, 136)
      setSound(soundUri, audioAttributes)
      setShowBadge(true)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }

    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel)
  }

  companion object {
    const val OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v4"
  }
}

package com.aagampartners

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
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

    // Android freezes a channel's sound after first creation. V3 deliberately
    // moves existing installs away from the old alarm-clock sound profile.
    val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      OPERATIONS_CHANNEL_ID,
      "Aagaam delivery alerts",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Loud order, rider, pickup and delivery-operation alerts"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 260, 100, 260, 100, 420)
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
    const val OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v3"
  }
}

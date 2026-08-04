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
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages.apply {
        add(RiderTrackingPackage())
        add(RiderOnlinePackage())
        add(FirebasePnvPackage())
        add(PartnerDocumentPickerPackage())
        add(PartnerAlertTonePackage())
        add(PartnerQrScannerPackage())
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
    val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(
      OPERATIONS_CHANNEL_ID,
      "AAGAM priority operations",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "New orders, Rider offers, pickup updates and delivery exceptions"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 180, 100, 180, 100, 280)
      enableLights(true)
      lightColor = Color.rgb(13, 148, 136)
      setSound(soundUri, audioAttributes)
      setShowBadge(true)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  companion object {
    const val OPERATIONS_CHANNEL_ID = "aagam_priority_operations_v2"
  }
}

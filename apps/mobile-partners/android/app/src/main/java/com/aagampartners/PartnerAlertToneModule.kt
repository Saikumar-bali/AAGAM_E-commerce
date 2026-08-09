package com.aagampartners

import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PartnerAlertToneModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var activeRingtone: Ringtone? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun getName(): String = "PartnerAlertTone"

  @ReactMethod
  fun play() {
    handler.post {
      try {
        activeRingtone?.stop()
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        activeRingtone = RingtoneManager.getRingtone(reactContext, uri)?.also { ringtone ->
          if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
            ringtone.isLooping = false
            ringtone.volume = 1.0f
          }
          ringtone.play()
          handler.postDelayed({
            ringtone.stop()
            if (activeRingtone === ringtone) activeRingtone = null
          }, 3200)
        }
      } catch (_error: Throwable) {
        // Notification delivery must never fail because a device has no audible tone.
      }
    }
  }

  @ReactMethod
  fun stop() {
    handler.post {
      activeRingtone?.stop()
      activeRingtone = null
    }
  }
}

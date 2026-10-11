package com.aagampartners

import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PartnerAlertToneModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var player: MediaPlayer? = null
  private val handler = Handler(Looper.getMainLooper())

  override fun getName(): String = "PartnerAlertTone"

  private fun stopInternal() {
    player?.let { media ->
      try {
        if (media.isPlaying) media.stop()
      } catch (_error: Throwable) {
        // Already stopped or released — nothing to do.
      }
      try {
        media.release()
      } catch (_error: Throwable) {
        // Release is best-effort.
      }
    }
    player = null
  }

  @ReactMethod
  fun play() {
    handler.post {
      try {
        stopInternal()
        val context = reactApplicationContext
        val resId = context.resources.getIdentifier(ALERT_RESOURCE, "raw", context.packageName)
        if (resId == 0) return@post
        val created = MediaPlayer.create(context, resId) ?: return@post
        created.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        created.setOnCompletionListener { media ->
          try {
            media.release()
          } catch (_error: Throwable) {
            // Release is best-effort.
          }
          if (player === media) player = null
        }
        player = created
        created.start()
      } catch (_error: Throwable) {
        // Notification delivery must never fail because a device cannot play audio.
        stopInternal()
      }
    }
  }

  @ReactMethod
  fun stop() {
    handler.post { stopInternal() }
  }

  companion object {
    private const val ALERT_RESOURCE = "rider_alert"
  }
}

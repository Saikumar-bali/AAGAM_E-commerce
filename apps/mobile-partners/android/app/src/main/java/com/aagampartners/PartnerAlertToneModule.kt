package com.aagampartners

import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class PartnerAlertToneModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private var activeTone: ToneGenerator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val scheduled = mutableListOf<Runnable>()

  override fun getName(): String = "PartnerAlertTone"

  private fun schedule(delayMs: Long, action: () -> Unit) {
    lateinit var runnable: Runnable
    runnable = Runnable {
      scheduled.remove(runnable)
      action()
    }
    scheduled.add(runnable)
    handler.postDelayed(runnable, delayMs)
  }

  private fun stopInternal() {
    scheduled.toList().forEach { runnable -> handler.removeCallbacks(runnable) }
    scheduled.clear()
    activeTone?.stopTone()
    activeTone?.release()
    activeTone = null
  }

  @ReactMethod
  fun play() {
    handler.post {
      try {
        stopInternal()
        // Use the notification stream rather than TYPE_ALARM. Three short,
        // high-volume pulses are intentionally easier to notice in a busy store
        // or on the road without sounding like the phone's alarm clock.
        val generator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
        activeTone = generator
        generator.startTone(ToneGenerator.TONE_PROP_BEEP2, 320)
        schedule(430) {
          if (activeTone === generator) {
            generator.startTone(ToneGenerator.TONE_PROP_ACK, 420)
          }
        }
        schedule(980) {
          if (activeTone === generator) {
            generator.startTone(ToneGenerator.TONE_PROP_BEEP2, 560)
          }
        }
        schedule(1_700) {
          if (activeTone === generator) {
            generator.release()
            activeTone = null
          }
        }
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
}

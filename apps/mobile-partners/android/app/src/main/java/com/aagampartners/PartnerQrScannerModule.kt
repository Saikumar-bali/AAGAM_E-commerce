package com.aagampartners

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.zxing.integration.android.IntentIntegrator

class PartnerQrScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext), ActivityEventListener {
  private var pendingPromise: Promise? = null

  init {
    reactContext.addActivityEventListener(this)
  }

  override fun getName() = "AagamPartnerQrScanner"

  @ReactMethod
  fun scan(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("QR_ACTIVITY_MISSING", "QR scanning requires an active screen")
      return
    }
    if (pendingPromise != null) {
      promise.reject("QR_SCANNER_BUSY", "Another QR scan is already open")
      return
    }

    pendingPromise = promise
    try {
      val integrator = IntentIntegrator(activity)
      integrator.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE)
      integrator.setPrompt("Scan the secure Aagaam pickup QR")
      integrator.setBeepEnabled(true)
      integrator.setBarcodeImageEnabled(false)
      integrator.setOrientationLocked(false)
      integrator.initiateScan()
    } catch (error: Exception) {
      finishWithError("QR_SCANNER_OPEN_FAILED", "QR scanner could not be opened", error)
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    val result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data) ?: return
    if (result.contents.isNullOrBlank()) {
      finishWithError("QR_SCANNER_CANCELLED", "QR scanning was cancelled")
      return
    }
    pendingPromise?.resolve(Arguments.createMap().apply {
      putString("value", result.contents)
      putString("format", "QR_CODE")
    })
    pendingPromise = null
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun finishWithError(code: String, message: String, error: Throwable? = null) {
    pendingPromise?.reject(code, message, error)
    pendingPromise = null
  }

  override fun invalidate() {
    reactContext.removeActivityEventListener(this)
    pendingPromise = null
    super.invalidate()
  }
}

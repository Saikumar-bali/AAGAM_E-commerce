package com.aagampartners

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.codescanner.GmsBarcodeScannerOptions
import com.google.android.gms.codescanner.GmsBarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode

class PartnerQrScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AagamPartnerQrScanner"

  @ReactMethod
  fun scan(promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("QR_ACTIVITY_MISSING", "QR scanning requires an active screen")
      return
    }
    val options = GmsBarcodeScannerOptions.Builder()
      .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
      .enableAutoZoom()
      .build()
    GmsBarcodeScanning.getClient(activity, options)
      .startScan()
      .addOnSuccessListener { barcode ->
        val rawValue = barcode.rawValue
        if (rawValue.isNullOrBlank()) {
          promise.reject("QR_VALUE_MISSING", "The scanned QR code was empty")
        } else {
          promise.resolve(Arguments.createMap().apply {
            putString("rawValue", rawValue)
            putString("format", "QR_CODE")
          })
        }
      }
      .addOnCanceledListener {
        promise.reject("QR_SCAN_CANCELLED", "QR scanning was cancelled")
      }
      .addOnFailureListener { error ->
        promise.reject("QR_SCAN_FAILED", "QR scanning failed", error)
      }
  }
}

package com.aagamcustomer

import android.graphics.Bitmap
import android.graphics.Color
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import java.io.ByteArrayOutputStream

class CustomerQrCodeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AagamCustomerQrCode"

  @ReactMethod
  fun render(value: String, size: Int, promise: Promise) {
    try {
      if (value.isBlank()) throw IllegalArgumentException("QR value is required")
      val dimension = size.coerceIn(240, 1200)
      val matrix = QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, dimension, dimension)
      val pixels = IntArray(dimension * dimension)
      for (y in 0 until dimension) {
        for (x in 0 until dimension) pixels[y * dimension + x] = if (matrix[x, y]) Color.BLACK else Color.WHITE
      }
      val bitmap = Bitmap.createBitmap(dimension, dimension, Bitmap.Config.ARGB_8888)
      bitmap.setPixels(pixels, 0, dimension, 0, 0, dimension, dimension)
      val out = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
      val encoded = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
      promise.resolve(Arguments.createMap().apply {
        putString("dataUrl", "data:image/png;base64,$encoded")
        putInt("size", dimension)
      })
    } catch (error: Exception) {
      promise.reject("QR_RENDER_FAILED", "Trusted Drop QR could not be rendered", error)
    }
  }
}

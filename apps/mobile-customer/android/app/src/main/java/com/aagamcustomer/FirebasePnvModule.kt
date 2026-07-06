package com.aagamcustomer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.pnv.FirebasePhoneNumberVerification

class FirebasePnvModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val verifier by lazy { FirebasePhoneNumberVerification.getInstance() }

  override fun getName(): String = "FirebasePnv"

  @ReactMethod
  fun getVerifiedPhoneNumber(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.reject("PNV_NO_ACTIVITY", "Activity unavailable")
      return
    }
    verifier.getVerifiedPhoneNumber(activity)
      .addOnSuccessListener { result ->
        val map = Arguments.createMap()
        map.putString("phoneNumber", result.getPhoneNumber())
        map.putString("token", result.getToken())
        promise.resolve(map)
      }
      .addOnFailureListener { err -> promise.reject("PNV_FAILED", err.message, err) }
  }

  @ReactMethod
  fun getVerificationSupportInfo(promise: Promise) {
    verifier.getVerificationSupportInfo()
      .addOnSuccessListener { results ->
        val map = Arguments.createMap()
        map.putBoolean("supported", results.any { it.isSupported() })
        promise.resolve(map)
      }
      .addOnFailureListener { err -> promise.reject("PNV_SUPPORT_FAILED", err.message, err) }
  }

  @ReactMethod
  fun enableTestSession(token: String, promise: Promise) {
    try {
      verifier.enableTestSession(token)
      val map = Arguments.createMap()
      map.putBoolean("ok", true)
      promise.resolve(map)
    } catch (err: Exception) {
      promise.reject("PNV_TEST_FAILED", err.message, err)
    }
  }
}

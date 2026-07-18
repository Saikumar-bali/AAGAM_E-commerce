package com.aagampartners

import androidx.credentials.CredentialManager
import androidx.credentials.DigitalCredential
import androidx.credentials.ExperimentalDigitalCredentialApi
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetDigitalCredentialOption
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.firebase.pnv.FirebasePhoneNumberVerification
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class FirebasePnvModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val pnv by lazy { FirebasePhoneNumberVerification.getInstance() }
  private var testSessionEnabled = false

  override fun getName() = "AagamFirebasePnv"

  @ReactMethod
  fun isPnvSupported(promise: Promise) {
    pnv.getVerificationSupportInfo()
      .addOnSuccessListener { results ->
        val map = Arguments.createMap().apply {
          putBoolean("supported", results.any { it.isSupported() })
          putInt("simCount", results.size)
        }
        promise.resolve(map)
      }
      .addOnFailureListener { error ->
        promise.resolve(Arguments.createMap().apply {
          putBoolean("supported", false)
          putString("reason", safeErrorCode(error))
        })
      }
  }

  @OptIn(ExperimentalDigitalCredentialApi::class)
  @ReactMethod
  fun startPnvVerification(nonce: String, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("PNV_ACTIVITY_MISSING", "Phone verification requires an active screen")
      return
    }
    if (nonce.isBlank()) {
      promise.reject("PNV_NONCE_MISSING", "Phone verification challenge is missing")
      return
    }

    pnv.getDigitalCredentialPayload(nonce)
      .addOnSuccessListener { payload ->
        CoroutineScope(Dispatchers.Main).launch {
          try {
            val requestJson = buildRequestJson(nonce, payload)
            val request = GetCredentialRequest.Builder()
              .addCredentialOption(GetDigitalCredentialOption(requestJson))
              .build()
            val response = CredentialManager.create(activity).getCredential(activity, request)
            val credential = response.credential
            if (credential !is DigitalCredential) {
              promise.reject(
                "PNV_UNEXPECTED_CREDENTIAL",
                "Phone verification returned an unsupported credential",
              )
              return@launch
            }
            val dcApiResponse = JSONObject(credential.credentialJson)
              .getJSONObject("data")
              .getJSONObject("vp_token")
              .getJSONArray("firebase")
              .getString(0)
            pnv.exchangeCredentialResponseForPhoneNumber(dcApiResponse)
              .addOnSuccessListener { result ->
                promise.resolve(Arguments.createMap().apply {
                  putString("token", result.getToken())
                })
              }
              .addOnFailureListener { error ->
                promise.reject("PNV_EXCHANGE_FAILED", safeErrorCode(error), error)
              }
          } catch (error: GetCredentialCancellationException) {
            promise.reject("PNV_DECLINED", "Phone number sharing was declined", error)
          } catch (error: GetCredentialUnsupportedException) {
            promise.reject("PNV_UNSUPPORTED", "Firebase phone verification is unsupported", error)
          } catch (error: GetCredentialException) {
            promise.reject("PNV_CREDENTIAL_FAILED", safeErrorCode(error), error)
          } catch (error: Exception) {
            promise.reject("PNV_FAILED", safeErrorCode(error), error)
          }
        }
      }
      .addOnFailureListener { error ->
        promise.reject("PNV_PAYLOAD_FAILED", safeErrorCode(error), error)
      }
  }

  @ReactMethod
  fun enablePnvTestSession(testNumberId: String, promise: Promise) {
    if (!BuildConfig.DEBUG) {
      promise.reject(
        "PNV_TEST_SESSION_FORBIDDEN",
        "PNV test sessions are disabled in release builds",
      )
      return
    }
    if (testNumberId.isBlank()) {
      promise.reject("PNV_TEST_TOKEN_MISSING", "A runtime PNV test token is required")
      return
    }
    if (testSessionEnabled) {
      promise.resolve(true)
      return
    }
    try {
      pnv.enableTestSession(testNumberId)
      testSessionEnabled = true
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("PNV_TEST_SESSION_FAILED", safeErrorCode(error), error)
    }
  }

  private fun buildRequestJson(nonce: String, payload: String): String {
    val data = JSONObject()
      .put("response_type", "vp_token")
      .put("response_mode", "dc_api")
      .put("nonce", nonce)
      .put(
        "dcql_query",
        JSONObject().put("credentials", JSONArray().put(JSONObject(payload))),
      )
    val request = JSONObject()
      .put("protocol", "openid4vp-v1-unsigned")
      .put("data", data)
    return JSONObject().put("requests", JSONArray().put(request)).toString()
  }

  private fun safeErrorCode(error: Throwable): String =
    error.javaClass.simpleName.ifBlank { "PNV_ERROR" }.take(80)
}

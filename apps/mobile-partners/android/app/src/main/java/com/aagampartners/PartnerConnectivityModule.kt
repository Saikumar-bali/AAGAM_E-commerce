package com.aagampartners

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class PartnerConnectivityModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private val manager = reactContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
  private var listening = false
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) = emit()
    override fun onLost(network: Network) = emit()
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) = emit()
  }

  override fun getName() = "AagamPartnerConnectivity"

  private fun connected(): Boolean {
    val network = manager.activeNetwork ?: return false
    val capabilities = manager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }

  private fun emit() {
    val payload = Arguments.createMap().apply { putBoolean("connected", connected()) }
    reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("AagamConnectivityChanged", payload)
  }

  @ReactMethod fun getCurrent(promise: Promise) = promise.resolve(connected())
  @ReactMethod fun addListener(eventName: String) {
    if (!listening) { manager.registerDefaultNetworkCallback(callback); listening = true }
  }
  @ReactMethod fun removeListeners(count: Int) {
    if (listening) { try { manager.unregisterNetworkCallback(callback) } catch (_: Exception) {}; listening = false }
  }
  override fun invalidate() { if (listening) try { manager.unregisterNetworkCallback(callback) } catch (_: Exception) {}; listening = false; super.invalidate() }
}

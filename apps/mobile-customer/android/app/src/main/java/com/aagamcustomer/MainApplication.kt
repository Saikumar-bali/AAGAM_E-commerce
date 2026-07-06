package com.aagamcustomer

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.uimanager.ViewManager

class CustomerNativePackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): MutableList<NativeModule> {
    return mutableListOf(FirebasePnvModule(reactContext))
  }
  override fun createViewManagers(reactContext: ReactApplicationContext): MutableList<ViewManager<*, *>> {
    return mutableListOf()
  }
}

class MainApplication : Application(), ReactApplication {
  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList = PackageList(this).packages.apply { add(CustomerNativePackage()) },
    )
  }
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}

# React Native
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.proguard.annotations.KeepGettersAndSetters *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }
-dontwarn com.facebook.react.**

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# react-native-screens
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.screens.** { *; }
-keep class com.facebook.react.modulescreens.** { *; }

# react-native-safe-area-context
-keep class com.th3rdwave.safeareacontext.** { *; }

# react-native-geolocation-service
-keep class com.agontuk.RNWeakReference.** { *; }
-keep class com.google.android.gms.location.** { *; }

# react-native-keychain
-keep class com.oblador.keychain.** { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Google Sign-In
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }

# Socket.IO
-keep class io.socket.** { *; }

# react-native-svg (CRITICAL - used by lucide-react-native)
-keep class com.horcrux.svg.** { *; }

# react-native-webview
-keep class com.reactnativecommunity.webview.** { *; }

# @react-native-async-storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# @react-native-google-signin
-keep class co.apptailor.googlesignin.** { *; }

# Keep native module registrations
-keep class * extends com.facebook.react.bridge.BaseJavaModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }

from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# Native Android foreground service owns the availability heartbeat so it
# survives React Native activity/process death and START_STICKY restarts.
Path('apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt').write_text(r'''package com.aagampartners

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native foreground service for Rider availability.
 *
 * The service owns GPS heartbeats rather than relying on a JavaScript timer, so
 * Android START_STICKY/alarm recovery continues refreshing availability even
 * after the React Native activity or process is recreated.
 */
class RiderOnlineService : Service() {
  companion object {
    const val ACTION_START = "com.aagampartners.online.START"
    const val ACTION_STOP = "com.aagampartners.online.STOP"
    const val ACTION_ALARM_TICK = "com.aagampartners.online.ALARM_TICK"

    const val EXTRA_RIDER_NAME = "riderName"
    const val EXTRA_API_URL = "apiUrl"
    const val EXTRA_AUTH_TOKEN = "authToken"

    const val CHANNEL_ID = "aagam_rider_online"
    const val NOTIFICATION_ID = 4201

    const val PREFS_NAME = "aagam_rider_online"
    const val KEY_ACTIVE = "active"
    const val KEY_RIDER_NAME = "riderName"
    const val KEY_API_URL = "apiUrl"
    const val KEY_AUTH_TOKEN = "authToken"
    const val KEY_LAST_SENT_AT = "lastSentAt"
    const val KEY_LAST_ERROR = "lastError"
    const val KEY_STOP_REASON = "stopReason"

    private const val ALARM_REQUEST_CODE = 7701
    private const val ALARM_INTERVAL_MS = 15 * 60 * 1000L
    private const val HEARTBEAT_INTERVAL_MS = 60_000L

    fun scheduleAlarm(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(context, AlarmReceiver::class.java).apply {
        action = ACTION_ALARM_TICK
      }
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val triggerAt = SystemClock.elapsedRealtime() + ALARM_INTERVAL_MS

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            triggerAt,
            pendingIntent,
          )
        } else {
          @Suppress("DEPRECATION")
          alarmManager.set(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            triggerAt,
            pendingIntent,
          )
        }
      } catch (_: SecurityException) {
        // OEM policy may restrict alarms. START_STICKY remains active.
      } catch (_: RuntimeException) {
        // Never crash availability when an OEM alarm implementation fails.
      }
    }

    fun cancelAlarm(context: Context) {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        ALARM_REQUEST_CODE,
        Intent(context, AlarmReceiver::class.java).apply { action = ACTION_ALARM_TICK },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      alarmManager.cancel(pendingIntent)
    }
  }

  private lateinit var locationClient: FusedLocationProviderClient
  private val executor = Executors.newSingleThreadExecutor()
  private val sending = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())
  private var locationCallback: LocationCallback? = null
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    locationClient = LocationServices.getFusedLocationProviderClient(this)
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopService("CLIENT_STOPPED")
        return START_NOT_STICKY
      }
      ACTION_START -> persistConfiguration(intent)
      ACTION_ALARM_TICK, null -> Unit
    }

    if (!configurationIsActive()) {
      stopSelf()
      return START_NOT_STICKY
    }

    startForeground(NOTIFICATION_ID, buildNotification())
    acquireWakeLock()
    startLocationUpdates()
    scheduleAlarm(this)
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    removeLocationUpdates()
    releaseWakeLock()
    executor.shutdownNow()
    if (preferences().getBoolean(KEY_ACTIVE, false)) scheduleAlarm(this)
    super.onDestroy()
  }

  private fun persistConfiguration(intent: Intent) {
    val riderName = intent.getStringExtra(EXTRA_RIDER_NAME) ?: "Rider"
    val apiUrl = intent.getStringExtra(EXTRA_API_URL)?.trimEnd('/') ?: ""
    val authToken = intent.getStringExtra(EXTRA_AUTH_TOKEN) ?: ""
    if (apiUrl.isBlank() || authToken.isBlank()) {
      preferences().edit()
        .putBoolean(KEY_ACTIVE, false)
        .putString(KEY_LAST_ERROR, "Availability configuration is incomplete")
        .apply()
      return
    }

    preferences().edit()
      .putBoolean(KEY_ACTIVE, true)
      .putString(KEY_RIDER_NAME, riderName)
      .putString(KEY_API_URL, apiUrl)
      .putString(KEY_AUTH_TOKEN, authToken)
      .putString(KEY_LAST_ERROR, null)
      .putString(KEY_STOP_REASON, null)
      .apply()
  }

  private fun configurationIsActive(): Boolean {
    val prefs = preferences()
    return prefs.getBoolean(KEY_ACTIVE, false) &&
      !prefs.getString(KEY_API_URL, "").isNullOrBlank() &&
      !prefs.getString(KEY_AUTH_TOKEN, "").isNullOrBlank()
  }

  private fun startLocationUpdates() {
    if (locationCallback != null) return
    val fineGranted = ActivityCompat.checkSelfPermission(
      this,
      Manifest.permission.ACCESS_FINE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    val coarseGranted = ActivityCompat.checkSelfPermission(
      this,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    ) == PackageManager.PERMISSION_GRANTED
    if (!fineGranted && !coarseGranted) {
      stopService("LOCATION_PERMISSION_MISSING")
      return
    }

    val request = LocationRequest.Builder(
      Priority.PRIORITY_HIGH_ACCURACY,
      HEARTBEAT_INTERVAL_MS,
    )
      .setMinUpdateIntervalMillis(HEARTBEAT_INTERVAL_MS)
      .setMinUpdateDistanceMeters(0f)
      .build()

    val callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let { location ->
          executor.execute { sendHeartbeat(location) }
        }
      }
    }
    locationCallback = callback
    locationClient.requestLocationUpdates(request, callback, mainLooper)
      .addOnFailureListener { error ->
        recordError(error.message ?: "Unable to start availability location updates")
        stopService("LOCATION_PROVIDER_FAILED")
      }

    locationClient.lastLocation.addOnSuccessListener { location ->
      location?.let { executor.execute { sendHeartbeat(it) } }
    }
  }

  private fun removeLocationUpdates() {
    locationCallback?.let { locationClient.removeLocationUpdates(it) }
    locationCallback = null
  }

  private fun sendHeartbeat(location: Location) {
    if (!configurationIsActive() || !sending.compareAndSet(false, true)) return
    val prefs = preferences()
    val apiUrl = prefs.getString(KEY_API_URL, "") ?: ""
    val token = prefs.getString(KEY_AUTH_TOKEN, "") ?: ""
    var connection: HttpURLConnection? = null

    try {
      val payload = JSONObject()
        .put("latitude", location.latitude)
        .put("longitude", location.longitude)
        .toString()
        .toByteArray(Charsets.UTF_8)

      connection = URL("$apiUrl/riders/me/heartbeat").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = 15_000
      connection.readTimeout = 15_000
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $token")
      connection.setRequestProperty("Content-Type", "application/json")
      connection.setFixedLengthStreamingMode(payload.size)
      connection.outputStream.use { it.write(payload) }

      when (val responseCode = connection.responseCode) {
        in 200..299 -> prefs.edit()
          .putString(KEY_LAST_SENT_AT, Instant.now().toString())
          .putString(KEY_LAST_ERROR, null)
          .apply()
        401, 403 -> requestStop("AUTHORIZATION_FAILED")
        409 -> requestStop("SERVER_MARKED_OFFLINE")
        else -> recordError("Availability heartbeat returned HTTP $responseCode")
      }
    } catch (error: Exception) {
      recordError(error.message ?: "Availability heartbeat failed")
    } finally {
      connection?.disconnect()
      sending.set(false)
    }
  }

  private fun requestStop(reason: String) {
    mainHandler.post { stopService(reason) }
  }

  private fun stopService(reason: String) {
    removeLocationUpdates()
    releaseWakeLock()
    cancelAlarm(this)
    preferences().edit()
      .putBoolean(KEY_ACTIVE, false)
      .remove(KEY_API_URL)
      .remove(KEY_AUTH_TOKEN)
      .putString(KEY_STOP_REASON, reason)
      .apply()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "aagam:rider-online",
    ).apply { acquire(12 * 60 * 60 * 1000L) }
  }

  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  private fun recordError(message: String) {
    preferences().edit().putString(KEY_LAST_ERROR, message.take(500)).apply()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Rider online",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Shows when you are online and ready to receive delivery offers"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val pendingIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        0,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }
    val riderName = preferences().getString(KEY_RIDER_NAME, "Rider") ?: "Rider"
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("AAGAM — You are online")
      .setContentText("Ready to receive delivery offers • $riderName")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setContentIntent(pendingIntent)
      .build()
  }

  private fun preferences() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val prefs = context.getSharedPreferences(RiderOnlineService.PREFS_NAME, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(RiderOnlineService.KEY_ACTIVE, false)) return

    val serviceIntent = Intent(context, RiderOnlineService::class.java).apply {
      action = RiderOnlineService.ACTION_ALARM_TICK
    }
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    } catch (_: RuntimeException) {
      // Android may restrict background starts; the next allowed alarm/launch retries.
    }
    RiderOnlineService.scheduleAlarm(context)
  }
}
''')

Path('apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineModule.kt').write_text(r'''package com.aagampartners

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap

class RiderOnlineModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "AagamRiderOnline"

  @ReactMethod
  fun start(options: ReadableMap, promise: Promise) {
    try {
      val riderName = if (options.hasKey("riderName")) options.getString("riderName") ?: "Rider" else "Rider"
      val apiUrl = if (options.hasKey("apiUrl")) options.getString("apiUrl") ?: "" else ""
      val authToken = if (options.hasKey("authToken")) options.getString("authToken") ?: "" else ""
      if (apiUrl.isBlank() || authToken.isBlank()) {
        promise.reject("RIDER_ONLINE_CONFIGURATION_MISSING", "API URL and mobile bearer token are required")
        return
      }

      requestBatteryOptimisationExemption()
      val intent = Intent(reactContext, RiderOnlineService::class.java).apply {
        action = RiderOnlineService.ACTION_START
        putExtra(RiderOnlineService.EXTRA_RIDER_NAME, riderName)
        putExtra(RiderOnlineService.EXTRA_API_URL, apiUrl)
        putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)
      }
      ContextCompat.startForegroundService(reactContext, intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactContext, RiderOnlineService::class.java).apply {
        action = RiderOnlineService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_STOP_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    try {
      val prefs = reactContext.getSharedPreferences(
        RiderOnlineService.PREFS_NAME,
        android.content.Context.MODE_PRIVATE,
      )
      val result = Arguments.createMap().apply {
        putBoolean("supported", true)
        putBoolean("active", prefs.getBoolean(RiderOnlineService.KEY_ACTIVE, false))
        putString("riderName", prefs.getString(RiderOnlineService.KEY_RIDER_NAME, null))
        putString("lastSentAt", prefs.getString(RiderOnlineService.KEY_LAST_SENT_AT, null))
        putString("lastError", prefs.getString(RiderOnlineService.KEY_LAST_ERROR, null))
        putBoolean("batteryOptimisationExempt", isIgnoringBatteryOptimisations())
      }
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("RIDER_ONLINE_STATUS_FAILED", error.message, error)
    }
  }

  private fun requestBatteryOptimisationExemption() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    if (isIgnoringBatteryOptimisations()) return
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${reactContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      try {
        val settingsIntent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        reactContext.startActivity(settingsIntent)
      } catch (_: Exception) {
        // The user can enable the exemption manually.
      }
    }
  }

  private fun isIgnoringBatteryOptimisations(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val pm = reactContext.getSystemService(android.content.Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(reactContext.packageName)
  }
}
''')

# Foreground service is now a real location service rather than a keep-alive-only special use.
manifest = Path('apps/mobile-partners/android/app/src/main/AndroidManifest.xml')
manifest_text = manifest.read_text()
old_service = '''      <service
        android:name=".RiderOnlineService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="specialUse"
        android:stopWithTask="false">
        <property
          android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
          android:value="rider_availability" />
      </service>
'''
new_service = '''      <service
        android:name=".RiderOnlineService"
        android:enabled="true"
        android:exported="false"
        android:foregroundServiceType="location"
        android:stopWithTask="false" />
'''
if manifest_text.count(old_service) != 1:
    raise SystemExit('Could not locate RiderOnlineService manifest entry')
manifest.write_text(manifest_text.replace(old_service, new_service, 1))

# JS delegates Android heartbeat ownership to native and passes durable configuration.
Path('apps/mobile-partners/src/services/RiderOnlineService.ts').write_text(r'''import Geolocation from 'react-native-geolocation-service';
import { NativeModules, Platform } from 'react-native';
import { apiClient, useAuthStore } from '@aagam/mobile-shared';

type NativeOnlineModule = {
  start: (options: {
    riderName: string;
    apiUrl: string;
    authToken: string;
  }) => Promise<boolean>;
  stop: () => Promise<boolean>;
  getStatus: () => Promise<{
    supported: boolean;
    active: boolean;
    riderName?: string | null;
    lastSentAt?: string | null;
    lastError?: string | null;
    batteryOptimisationExempt?: boolean;
  }>;
};

const nativeModule = NativeModules.AagamRiderOnline as NativeOnlineModule | undefined;
const HEARTBEAT_INTERVAL_MS = 60_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatGeneration = 0;
let heartbeatController: AbortController | null = null;
let heartbeatInFlight = false;

export function riderOnlineSupported() {
  return Platform.OS === 'android' && Boolean(nativeModule);
}

function currentPosition() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      reject,
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  });
}

async function sendAvailabilityHeartbeat(generation: number) {
  if (heartbeatInFlight || generation !== heartbeatGeneration) return;
  heartbeatInFlight = true;
  try {
    const location = await currentPosition();
    if (generation !== heartbeatGeneration) return;
    const controller = new AbortController();
    heartbeatController = controller;
    await apiClient.post('/riders/me/heartbeat', location, { signal: controller.signal });
  } catch {
    // Non-Android fallback is best effort. Android owns this in the native FGS.
  } finally {
    if (generation === heartbeatGeneration) heartbeatController = null;
    heartbeatInFlight = false;
  }
}

function startHeartbeatFallback() {
  if (heartbeatTimer) return;
  const generation = ++heartbeatGeneration;
  void sendAvailabilityHeartbeat(generation);
  heartbeatTimer = setInterval(() => {
    void sendAvailabilityHeartbeat(generation);
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatFallback() {
  heartbeatGeneration += 1;
  heartbeatController?.abort();
  heartbeatController = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  heartbeatInFlight = false;
}

export const RiderOnlineService = {
  async start(riderName: string) {
    if (riderOnlineSupported() && nativeModule) {
      stopHeartbeatFallback();
      const authToken = useAuthStore.getState().token;
      const apiUrl = String(apiClient.defaults.baseURL || '').replace(/\/+$/, '');
      if (!authToken || !apiUrl) {
        throw new Error('Rider availability requires an authenticated mobile session');
      }
      return nativeModule.start({ riderName, apiUrl, authToken });
    }
    startHeartbeatFallback();
    return false;
  },

  async stop() {
    stopHeartbeatFallback();
    if (!riderOnlineSupported() || !nativeModule) return false;
    return nativeModule.stop();
  },

  async status() {
    if (!riderOnlineSupported() || !nativeModule) {
      return { supported: false, active: Boolean(heartbeatTimer) };
    }
    return nativeModule.getStatus();
  },
};
''')

# Add a validated POST route tailored to native HttpURLConnection.
dto_path = 'apps/api-gateway/src/riders/rider-status.dto.ts'
replace_once(
    dto_path,
    '''export type RiderAdminStatus = RiderSelfStatus | 'BUSY';

class RiderCoordinatesDto {
''',
    '''export type RiderAdminStatus = RiderSelfStatus | 'BUSY';

export class RiderHeartbeatDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

class RiderCoordinatesDto {
''',
)

controller_path = 'apps/api-gateway/src/riders/rider.controller.ts'
replace_once(
    controller_path,
    '''  AdminUpdateRiderStatusDto,
  UpdateMyRiderStatusDto,
''',
    '''  AdminUpdateRiderStatusDto,
  RiderHeartbeatDto,
  UpdateMyRiderStatusDto,
''',
)
replace_once(
    controller_path,
    '''  @Get(':id')
''',
    '''  @Post('me/heartbeat')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async heartbeat(@Req() req: any, @Body() data: RiderHeartbeatDto) {
    return this.riderService.updateStatusForUser(req.user.id, {
      status: 'ONLINE',
      heartbeat: true,
      latitude: data.latitude,
      longitude: data.longitude,
    });
  }

  @Get(':id')
''',
)

# Return the committed status before a potentially expensive recovery sweep.
rider_service_path = 'apps/api-gateway/src/riders/rider.service.ts'
replace_once(
    rider_service_path,
    '''    if (result.wakeWaitingJobs) await this.dispatchWaitingJobs();
    return result.updated;
''',
    '''    if (result.wakeWaitingJobs) this.scheduleDispatchWaitingJobs();
    return result.updated;
''',
)
replace_once(
    rider_service_path,
    '''    if (result.wakeWaitingJobs) await this.dispatchWaitingJobs();
    return result.updated;
''',
    '''    if (result.wakeWaitingJobs) this.scheduleDispatchWaitingJobs();
    return result.updated;
''',
)
replace_once(
    rider_service_path,
    '''  private async dispatchWaitingJobs() {
''',
    '''  private scheduleDispatchWaitingJobs() {
    setImmediate(() => {
      void this.dispatchWaitingJobs();
    });
  }

  private async dispatchWaitingJobs() {
''',
)

# Stop the native service when refreshed server state becomes OFFLINE.
dashboard_path = 'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx'
replace_once(
    dashboard_path,
    '''      if (online) {
        RiderOnlineService.start(user?.name || 'Rider').catch(() => undefined);
      }
''',
    '''      if (online) {
        RiderOnlineService.start(user?.name || 'Rider').catch(() => undefined);
      } else {
        RiderOnlineService.stop().catch(() => undefined);
      }
''',
)
replace_once(
    dashboard_path,
    '''  }, [workspace?.rider?.status]);
''',
    '''  }, [workspace?.rider?.status, user?.name]);
''',
)

# Database regression: status response must not await recovery backlog work.
e2e_path = 'apps/api-gateway/src/auto-dispatch-recovery.e2e.spec.ts'
e2e_anchor = '''  it('prevents active Riders from going offline and concurrent jobs from double-offering one Rider', async () => {
'''
e2e_test = '''  it('returns the online status before the best-effort waiting-job sweep resolves', async () => {
    const candidate = await rider('detached_wakeup', 'OFFLINE', null, null);
    const neverResolves = new Promise(() => undefined);
    const autoDispatch = {
      dispatchWaitingJobs: jest.fn(() => neverResolves),
    };
    const service = new RiderService(autoDispatch as any);

    await expect(
      service.updateStatusForUser(candidate.user.id, {
        status: 'ONLINE',
        latitude: 17.7004,
        longitude: 83.3004,
      }),
    ).resolves.toMatchObject({ status: 'ONLINE' });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(autoDispatch.dispatchWaitingJobs).toHaveBeenCalledTimes(1);
  });

'''
replace_once(e2e_path, e2e_anchor, e2e_test + e2e_anchor)

# Source contracts cover the native owner, detached server recovery and offline reconciliation.
contract_path = 'apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts'
replace_once(
    contract_path,
    '''    expect(rider).toContain('await this.dispatchWaitingJobs()');
''',
    '''    expect(rider).toContain('scheduleDispatchWaitingJobs()');
    expect(rider).toContain('setImmediate(() =>');
    expect(rider).not.toContain('if (result.wakeWaitingJobs) await this.dispatchWaitingJobs()');
''',
)
replace_once(
    contract_path,
    '''  it('keeps online Rider coordinates fresh through an authenticated mobile heartbeat', () => {
''',
    '''  it('keeps Android Rider availability alive from the native foreground service', () => {
    const nativeService = read(
      'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt',
    );
    const nativeModule = read(
      'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineModule.kt',
    );
    const manifest = read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml');
    expect(nativeService).toContain('FusedLocationProviderClient');
    expect(nativeService).toContain('LocationRequest.Builder(');
    expect(nativeService).toContain('START_STICKY');
    expect(nativeService).toContain('/riders/me/heartbeat');
    expect(nativeService).toContain('EXTRA_AUTH_TOKEN');
    expect(nativeService).toContain('SERVER_MARKED_OFFLINE');
    expect(nativeModule).toContain('putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)');
    expect(manifest).toContain('android:foregroundServiceType="location"');
  });

  it('keeps online Rider coordinates fresh through an authenticated mobile heartbeat', () => {
''',
)
replace_once(
    contract_path,
    '''    expect(source).toContain('apiClient.patch(');
    expect(source).toContain("'/riders/me/status'");
    expect(source).toContain("status: 'ONLINE', heartbeat: true");
''',
    '''    expect(source).toContain("apiClient.post('/riders/me/heartbeat'");
    expect(source).toContain('nativeModule.start({ riderName, apiUrl, authToken })');
    expect(source).toContain('useAuthStore.getState().token');
''',
)
replace_once(
    contract_path,
    '''  it('stops the Rider availability heartbeat before signing out', () => {
''',
    '''  it('stops native availability when refreshed workspace state is offline', () => {
    const source = read(
      'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx',
    );
    expect(source).toContain('} else {\n        RiderOnlineService.stop()');
  });

  it('stops the Rider availability heartbeat before signing out', () => {
''',
)

# Extend the existing Android keep-alive contract with native heartbeat proof.
alarm_test_path = 'apps/mobile-partners/src/riderOnlineAlarm.contract.spec.ts'
replace_once(
    alarm_test_path,
    '''  it('starts the service with the API-appropriate Android method', () => {
''',
    '''  it('owns authenticated location heartbeats inside the native service', () => {
    expect(source).toContain('FusedLocationProviderClient');
    expect(source).toContain('LocationRequest.Builder(');
    expect(source).toContain('/riders/me/heartbeat');
    expect(source).toContain('START_STICKY');
    expect(source).toContain('SERVER_MARKED_OFFLINE');
  });

  it('starts the service with the API-appropriate Android method', () => {
''',
)

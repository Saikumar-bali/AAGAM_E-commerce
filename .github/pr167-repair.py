from pathlib import Path
import re
import textwrap


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def block(source: str, indent: int = 0) -> str:
    value = textwrap.dedent(source).strip("\n")
    return textwrap.indent(value, " " * indent)


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    if old not in text:
        raise SystemExit(f"{label}: expected source pattern not found in {path}")
    write(path, text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, label: str, flags: int = re.S) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match in {path}, found {count}")
    write(path, updated)


dashboard = "apps/mobile-partners/src/screens/rider/RiderDashboard.tsx"
replace_once(
    dashboard,
    "import { useAuthStore } from '@aagam/mobile-shared';",
    "import { startMobilePushLifecycle, useAuthStore } from '@aagam/mobile-shared';",
    "dashboard push lifecycle import",
)
replace_once(
    dashboard,
    "  Alert,\n  RefreshControl,",
    "  Alert,\n  Linking,\n  PermissionsAndroid,\n  Platform,\n  RefreshControl,",
    "dashboard Android permission imports",
)
replace_once(
    dashboard,
    "function shortId(value?: string | null) {",
    block("""
async function requestRiderLocationPermission() {
  if (Platform.OS !== 'android') return true;

  const finePermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
  const fineResult = await PermissionsAndroid.check(finePermission)
    ? PermissionsAndroid.RESULTS.GRANTED
    : await PermissionsAndroid.request(finePermission, {
        title: 'Allow rider location',
        message: 'Aagaam Partners uses precise location while you are online and fulfilling deliveries.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
  if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) return false;
  if (Number(Platform.Version) < 29) return true;

  const backgroundPermission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
  if (await PermissionsAndroid.check(backgroundPermission)) return true;
  const backgroundResult = await PermissionsAndroid.request(backgroundPermission, {
    title: 'Allow background rider location',
    message: 'Choose Allow all the time so dispatch can keep your availability fresh in the background.',
    buttonPositive: 'Continue',
    buttonNegative: 'Not now',
  });
  if (backgroundResult === PermissionsAndroid.RESULTS.GRANTED) return true;

  if (Number(Platform.Version) >= 30) {
    Alert.alert(
      'Allow background location',
      'Open App permissions → Location and choose Allow all the time, then return and tap Grant location.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => undefined) },
      ],
    );
  }
  return false;
}

function shortId(value?: string | null) {
"""),
    "dashboard permission helper",
)
replace_once(
    dashboard,
    "  const [statusBusy, setStatusBusy] = useState(false);\n  const [offerBusy",
    "  const [statusBusy, setStatusBusy] = useState(false);\n"
    "  const statusBusyRef = useRef(false);\n"
    "  const [onlinePermissionMissing, setOnlinePermissionMissing] = useState(false);\n"
    "  const [offerBusy",
    "dashboard availability state",
)

old_notification = block("""
useEffect(() => {
  const openNotification = (message: any) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    if (message?.data?.deliveryJobId || message?.data?.orderId) navigation?.navigate?.('Operations');
    else navigation?.navigate?.('Alerts');
  };
  const unsubscribeForeground = messaging().onMessage(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    Toast.show({ type: 'info', text1: 'New rider update', text2: 'Your job queue has been refreshed.' });
  });
  const unsubscribeOpened = messaging().onNotificationOpenedApp(openNotification);
  void messaging().getInitialNotification().then((message) => {
    if (message) openNotification(message);
  });
  return () => {
    unsubscribeForeground();
    unsubscribeOpened();
  };
}, [navigation, queryClient]);
""", 2)
new_notification = block("""
useEffect(() => {
  let alive = true;
  let unsubscribePushLifecycle: (() => void) | undefined;
  void startMobilePushLifecycle('Aagaam Partners').then((unsubscribe) => {
    if (alive) unsubscribePushLifecycle = unsubscribe;
    else unsubscribe();
  }).catch(() => undefined);

  const openNotification = (message: any) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    if (message?.data?.deliveryJobId || message?.data?.orderId) navigation?.navigate?.('Operations');
    else navigation?.navigate?.('Alerts');
  };
  const unsubscribeForeground = messaging().onMessage(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY }),
      queryClient.invalidateQueries({ queryKey: PARTNER_NOTIFICATION_QUERY_KEY }),
    ]);
    Toast.show({ type: 'info', text1: 'New rider update', text2: 'Your job queue has been refreshed.' });
  });
  const unsubscribeOpened = messaging().onNotificationOpenedApp(openNotification);
  void messaging().getInitialNotification().then((message) => {
    if (message) openNotification(message);
  });
  return () => {
    alive = false;
    unsubscribePushLifecycle?.();
    unsubscribeForeground();
    unsubscribeOpened();
  };
}, [navigation, queryClient]);
""", 2)
replace_once(dashboard, old_notification, new_notification, "dashboard push lifecycle effect")

old_online_effect = block("""
useEffect(() => {
  if (riderStatus === 'OFFLINE') {
    void RiderOnlineService.stop().catch(() => undefined);
    return;
  }
  void RiderOnlineService.start(user?.name || 'Rider').catch((error: any) => {
    Toast.show({
      type: 'error',
      text1: 'Background availability unavailable',
      text2: error?.message || 'Could not keep the rider heartbeat active.',
    });
  });
}, [riderStatus, user?.name]);
""", 2)
new_online_effect = block("""
const grantOnlinePermission = async () => {
  if (statusBusyRef.current) return false;
  statusBusyRef.current = true;
  setStatusBusy(true);
  try {
    const permitted = await requestRiderLocationPermission();
    if (!permitted) {
      setOnlinePermissionMissing(true);
      await RiderOnlineService.stop().catch(() => undefined);
      Toast.show({
        type: 'error',
        text1: 'Background location required',
        text2: 'Grant “Allow all the time” to stay eligible for delivery offers.',
      });
      return false;
    }
    await RiderOnlineService.start(user?.name || 'Rider');
    setOnlinePermissionMissing(false);
    return true;
  } catch (error: any) {
    setOnlinePermissionMissing(true);
    await RiderOnlineService.stop().catch(() => undefined);
    Toast.show({
      type: 'error',
      text1: 'Online recovery unavailable',
      text2: error?.message || 'Could not start background rider availability.',
    });
    return false;
  } finally {
    statusBusyRef.current = false;
    setStatusBusy(false);
  }
};

useEffect(() => {
  if (riderStatus === 'OFFLINE') {
    setOnlinePermissionMissing(false);
    void RiderOnlineService.stop().catch(() => undefined);
    return;
  }
  let cancelled = false;
  const restoreOnlineAvailability = async () => {
    const started = await grantOnlinePermission();
    if (!cancelled && !started) setOnlinePermissionMissing(true);
  };
  void restoreOnlineAvailability();
  return () => {
    cancelled = true;
  };
}, [riderStatus, user?.name]);
""", 2)
replace_once(dashboard, old_online_effect, new_online_effect, "dashboard online restoration")

replace_regex(
    dashboard,
    r"  const changeAvailability = async \(online: boolean\) => \{.*?\n  \};\n\n  const acceptMutation",
    block("""
const changeAvailability = async (online: boolean) => {
  if (statusBusyRef.current) return;
  if (!online && activeJob) {
    Toast.show({
      type: 'error',
      text1: 'Active delivery',
      text2: 'Complete or return the current delivery before going offline.',
    });
    return;
  }

  statusBusyRef.current = true;
  setStatusBusy(true);
  try {
    if (online) {
      const permitted = await requestRiderLocationPermission();
      if (!permitted) {
        setOnlinePermissionMissing(true);
        await RiderOnlineService.stop().catch(() => undefined);
        Toast.show({
          type: 'error',
          text1: 'Background location required',
          text2: 'Grant “Allow all the time” before going online.',
        });
        return;
      }
      const location = await optionalCurrentLocation();
      if (!location) throw new Error('Enable precise GPS and try again.');
      await riderService.updateMyStatus('ONLINE', location);
      try {
        await RiderOnlineService.start(user?.name || 'Rider');
        setOnlinePermissionMissing(false);
      } catch (serviceError) {
        await RiderOnlineService.stop().catch(() => undefined);
        await riderService.updateMyStatus('OFFLINE').catch(() => undefined);
        throw serviceError;
      }
    } else {
      await trackingManager.stop('RIDER_OFFLINE');
      await RiderOnlineService.stop().catch(() => undefined);
      await riderService.updateMyStatus('OFFLINE');
      setOnlinePermissionMissing(false);
    }

    await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
    Toast.show({
      type: 'success',
      text1: online ? 'You are online' : 'You are offline',
      text2: online
        ? 'Background heartbeat is active and dispatch can send offers.'
        : 'New delivery offers and location heartbeats are paused.',
    });
  } catch (error: any) {
    Toast.show({ type: 'error', text1: 'Availability update failed', text2: errorMessage(error) });
  } finally {
    statusBusyRef.current = false;
    setStatusBusy(false);
  }
};

const onlineToggleAction = onlinePermissionMissing
  ? grantOnlinePermission
  : () => changeAvailability(!isOnline);

const acceptMutation
""", 2),
    "dashboard availability mutation",
)
old_switch = block("""
{statusBusy ? (
  <ActivityIndicator color="#0F766E" />
) : (
  <Switch
    testID="rider_availability_switch"
    value={isOnline}
    disabled={statusBusy || riderStatus === 'BUSY'}
    onValueChange={(value) => void changeAvailability(value)}
    trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
    thumbColor={isOnline ? '#0F766E' : '#FFFFFF'}
  />
)}
""", 12)
new_switch = block("""
{statusBusy ? (
  <ActivityIndicator color="#0F766E" />
) : onlinePermissionMissing ? (
  <TouchableOpacity style={styles.permissionButton} onPress={() => void onlineToggleAction()}>
    <Text style={styles.permissionButtonText}>{'GRANT LOCATION'}</Text>
  </TouchableOpacity>
) : (
  <Switch
    testID="rider_availability_switch"
    value={isOnline}
    disabled={statusBusy || riderStatus === 'BUSY'}
    onValueChange={(value) => void changeAvailability(value)}
    trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
    thumbColor={isOnline ? '#0F766E' : '#FFFFFF'}
  />
)}
""", 12)
replace_once(dashboard, old_switch, new_switch, "dashboard permission recovery UI")
replace_once(
    dashboard,
    "  availabilityText: { color: '#64748B', fontSize: 10, marginTop: 3 },",
    "  availabilityText: { color: '#64748B', fontSize: 10, marginTop: 3 },\n"
    "  permissionButton: { minHeight: 36, borderRadius: 11, backgroundColor: '#0F766E', paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },\n"
    "  permissionButtonText: { color: '#FFFFFF', fontSize: 8, fontWeight: '900' },",
    "dashboard permission styles",
)

profile = "apps/mobile-partners/src/screens/rider/RiderProfileScreen.tsx"
replace_once(
    profile,
    "import { riderService } from '../../api/riderService';",
    "import { riderService } from '../../api/riderService';\n"
    "import { RiderOnlineService } from '../../services/RiderOnlineService';",
    "profile online service import",
)
replace_once(
    profile,
    "            isAvailable: Boolean(row.isAvailable),\n            enabled: true,",
    "            isAvailable: Boolean(row.isAvailable),\n            enabled: Boolean(row.isAvailable),",
    "profile schedule hydration",
)
replace_once(
    profile,
    "onValueChange={(enabled) => setSchedule((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, enabled } : item))}",
    "onValueChange={(enabled) => setSchedule((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, enabled, isAvailable: enabled } : item))}",
    "profile schedule toggle",
)
old_profile_mutation = block("""
const profileMutation = useMutation({
  mutationFn: () => riderService.updateProfile({
    vehicleType,
    vehicleNumber,
    emergencyContactName: emergencyName,
    emergencyContactPhone: emergencyPhone,
    bankAccountNumber: bankAccount,
    bankIfsc,
  }),
""", 2)
new_profile_mutation = block("""
const profileMutation = useMutation({
  mutationFn: () => riderService.updateProfile({
    ...(vehicleType.trim() ? { vehicleType: vehicleType.trim() } : {}),
    ...(vehicleNumber.trim() ? { vehicleNumber: vehicleNumber.trim().toUpperCase() } : {}),
    ...(emergencyName.trim() ? { emergencyContactName: emergencyName.trim() } : {}),
    ...(emergencyPhone.trim() ? { emergencyContactPhone: emergencyPhone.trim() } : {}),
    ...(bankAccount.trim() || bankIfsc.trim()
      ? { bankAccountNumber: bankAccount.trim(), bankIfsc: bankIfsc.trim().toUpperCase() }
      : {}),
  }),
""", 2)
replace_once(profile, old_profile_mutation, new_profile_mutation, "profile optional field payload")
replace_once(
    profile,
    "  const profileLoading = profileQuery.isLoading || availabilityQuery.isLoading;",
    block("""
const signOutRider = async () => {
  try {
    await RiderOnlineService.stop();
  } finally {
    await logout();
  }
};

const profileLoading = profileQuery.isLoading || availabilityQuery.isLoading;
""", 2),
    "profile sign-out lifecycle",
)
replace_once(
    profile,
    "{ text: 'Sign out', style: 'destructive', onPress: () => void logout() },",
    "{ text: 'Sign out', style: 'destructive', onPress: () => void signOutRider() },",
    "profile sign-out callback",
)

delivery = "apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx"
old_destination_vars = block("""
const headingToStore = Boolean(
  activeJob
  && ['RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE'].includes(activeJob.status),
);
const customerName = activeJob?.order.customer?.name
  || activeJob?.order.addressSnapshot?.recipientName
  || 'Customer';
const customerPhone = activeJob?.order.customer?.phone
  || activeJob?.order.addressSnapshot?.phoneE164
  || null;
const storePhone = (activeJob?.order.store as any)?.phone || null;
""", 2)
new_destination_vars = block("""
const returningToStore = activeJob?.status === 'RETURNING_TO_STORE';
const headingToStore = Boolean(
  activeJob
  && (returningToStore || ['RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE'].includes(activeJob.status)),
);
const customerName = activeJob?.order.customer?.name
  || activeJob?.order.addressSnapshot?.recipientName
  || 'Customer';
const customerPhone = activeJob?.order.customer?.phone
  || activeJob?.order.addressSnapshot?.phoneE164
  || null;
const storePhone = (activeJob?.order.store as any)?.owner?.phone || null;
""", 2)
replace_once(delivery, old_destination_vars, new_destination_vars, "delivery return destination")
replace_once(
    delivery,
    "  const recordFailure = () => {\n    if (!activeJob) return;",
    "  const recordFailure = () => {\n"
    "    if (!activeJob) return;\n"
    "    if (failureReason === 'OTHER' && failureNote.trim().length < 3) {\n"
    "      Toast.show({ type: 'error', text1: 'Failure details required', text2: 'Add a brief note when selecting Other.' });\n"
    "      return;\n"
    "    }",
    "delivery OTHER validation",
)
replace_once(
    delivery,
    "<Text style={styles.destinationLabel}>{headingToStore ? 'PICKUP STORE' : 'DELIVER TO'}</Text>",
    "<Text style={styles.destinationLabel}>{returningToStore ? 'RETURN STORE' : headingToStore ? 'PICKUP STORE' : 'DELIVER TO'}</Text>",
    "delivery return label",
)
replace_once(
    delivery,
    "        {summaryQuery.isError ? (",
    block("""
{policy.waitingForStoreReturn ? (
  <View style={styles.locationNote}>
    <Store size={18} color="#0F766E" />
    <Text style={styles.locationNoteText}>Return this parcel to the owning store shown above. Store verification will complete the return.</Text>
  </View>
) : null}

{summaryQuery.isError ? (
""", 8),
    "delivery return instruction",
)

client = "packages/mobile-shared/src/api/client.ts"
replace_once(
    client,
    "  if (authStoreToken) {\n    config.headers.Authorization = `Bearer ${authStoreToken}`;\n  }",
    "  const existingAuthorization = config.headers?.Authorization || config.headers?.authorization;\n"
    "  if (authStoreToken && !existingAuthorization) {\n"
    "    config.headers.Authorization = `Bearer ${authStoreToken}`;\n"
    "  }",
    "auth preserve explicit authorization",
)
replace_once(
    client,
    "    if (status === 401 && authStoreToken && !isPublicAuthRequest(requestUrl)) {",
    "    const requestAuthorization = error?.config?.headers?.Authorization || error?.config?.headers?.authorization;\n"
    "    const bearerSessionFailed = typeof requestAuthorization === 'string'\n"
    "      && requestAuthorization === `Bearer ${authStoreToken}`;\n\n"
    "    if (status === 401 && authStoreToken && bearerSessionFailed && !isPublicAuthRequest(requestUrl)) {",
    "auth bearer-only logout",
)

orders = "apps/mobile-partners/src/screens/store/StoreOrdersScreen.tsx"
text = read(orders)
text, count = re.subn(r"\n\s*placeholderData:\s*\(previousData\)\s*=>\s*previousData,", "", text, count=1)
if count != 1:
    raise SystemExit(f"store orders placeholder removal expected one match, found {count}")
marker = "  const totalPages = Math.max(1, Number(data?.meta?.totalPages || 1));"
if marker not in text:
    raise SystemExit("store orders totalPages marker missing")
text = text.replace(
    marker,
    marker + "\n\n  useEffect(() => {\n    if (page > totalPages) setPage(totalPages);\n  }, [page, totalPages]);",
    1,
)
if "{totalPages > 1 ?" not in text:
    raise SystemExit("store orders pagination condition missing")
text = text.replace("{totalPages > 1 ?", "{totalPages > 1 || page > 1 ?", 1)
write(orders, text)

store_service = "apps/mobile-partners/src/api/storeService.ts"
replace_once(
    store_service,
    "  getStoreDashboardSummaries: async () => {\n"
    "    const r = await apiClient.get('/store-owner/stores');\n"
    "    return r.data;\n"
    "  },",
    "  getStoreDashboardSummaries: async () => {\n"
    "    const r = await apiClient.get('/store-owner/stores');\n"
    "    return r.data;\n"
    "  },\n\n"
    "  getPendingOrderCount: async (): Promise<{ count: number }> => {\n"
    "    const r = await apiClient.get('/store-owner/store-orders/summary/pending-count');\n"
    "    return r.data;\n"
    "  },",
    "store pending count client",
)

store_nav = "apps/mobile-partners/src/navigation/StoreNavigator.tsx"
replace_regex(
    store_nav,
    r"async function pendingStoreOrders\(\)\s*\{.*?\n\}",
    block("""
async function pendingStoreOrders() {
  const result = await storeService.getPendingOrderCount();
  return Number(result?.count || 0);
}
"""),
    "store lightweight badge query",
)

controller = "apps/api-gateway/src/stores/store-orders.controller.ts"
replace_once(
    controller,
    "  @Get(':storeId')",
    block("""
@Get('summary/pending-count')
async getPendingOrderCount(@Req() req: any) {
  const roles = new Set<string>((req.user?.roles || []).map(String));
  const stores = await this.prisma.store.findMany({
    where: this.isAdmin(roles)
      ? { deletedAt: null }
      : { ownerId: req.user.id, deletedAt: null },
    select: { id: true },
  });
  if (!stores.length) return { count: 0 };

  const count = await this.prisma.order.count({
    where: {
      storeId: { in: stores.map((store) => store.id) },
      status: { in: [OrderStatus.PENDING, OrderStatus.PAYMENT_PENDING] },
    },
  });
  return { count };
}

@Get(':storeId')
""", 2),
    "store pending count endpoint",
)

candidates = []
for path in Path("apps/api-gateway/src").rglob("*.ts"):
    source = path.read_text(encoding="utf-8")
    if (
        "pendingOffers" in source
        and "activeJob" in source
        and "ownerId: true" in source
        and "latitude: true" in source
        and "longitude: true" in source
    ):
        candidates.append(path)
if not candidates:
    raise SystemExit("rider workspace store projection file not found")
projection = candidates[0]
source = projection.read_text(encoding="utf-8")
if "owner: { select: { phone: true } }" not in source:
    source = source.replace(
        "ownerId: true,",
        "ownerId: true,\n                owner: { select: { phone: true } },",
        1,
    )
projection.write_text(source, encoding="utf-8")
print(f"Added store owner contact to {projection}")

hardening = "apps/api-gateway/src/mobile-commerce-hardening.contract.spec.ts"
replace_once(
    hardening,
    "apps/mobile-partners/src/screens/rider/RiderDeliveryOperationsScreen.tsx",
    "apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx",
    "canonical POD contract target",
)

print("PR #167 remediation patches applied.")

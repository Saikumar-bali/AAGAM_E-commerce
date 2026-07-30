from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:160]!r}")
    file.write_text(source.replace(old, new, 1))


native = 'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt'
replace_once(
    native,
    '''    if (!fineGranted && !coarseGranted) {
      stopService("LOCATION_PERMISSION_MISSING")
      return
    }

    val request = LocationRequest.Builder(
''',
    '''    if (!fineGranted && !coarseGranted) {
      stopService("LOCATION_PERMISSION_MISSING")
      return
    }
    val backgroundGranted = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
      ActivityCompat.checkSelfPermission(
        this,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION,
      ) == PackageManager.PERMISSION_GRANTED
    if (!backgroundGranted) {
      stopService("BACKGROUND_LOCATION_PERMISSION_MISSING")
      return
    }

    val request = LocationRequest.Builder(
''',
)

dashboard = 'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx'
replace_once(
    dashboard,
    '''  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Allow rider location',
        message: 'AAGAM Partners uses your location only while you are online and fulfilling a delivery.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  };
''',
    '''  const requestLocationPermission = async () => {
    if (Platform.OS !== 'android') return true;

    const finePermission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
    const fineResult = await PermissionsAndroid.check(finePermission)
      ? PermissionsAndroid.RESULTS.GRANTED
      : await PermissionsAndroid.request(finePermission, {
          title: 'Allow rider location',
          message: 'AAGAM Partners uses precise location while you are online and fulfilling a delivery.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        });
    if (fineResult !== PermissionsAndroid.RESULTS.GRANTED) return false;

    if (Number(Platform.Version) < 29) return true;
    const backgroundPermission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
    if (await PermissionsAndroid.check(backgroundPermission)) return true;

    const backgroundResult = await PermissionsAndroid.request(backgroundPermission, {
      title: 'Allow background rider location',
      message: 'Choose Allow all the time so Android can keep you eligible for delivery offers while the app is in the background.',
      buttonPositive: 'Continue',
      buttonNegative: 'Not now',
    });
    if (backgroundResult === PermissionsAndroid.RESULTS.GRANTED) return true;

    if (Number(Platform.Version) >= 30) {
      Alert.alert(
        'Allow background location',
        'Open App permissions → Location and choose Allow all the time. Then return and tap ONLINE again.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => Linking.openSettings().catch(() => undefined),
          },
        ],
      );
    }
    return false;
  };
''',
)
replace_once(
    dashboard,
    '''      if (!permitted) {
        Toast.show({ type: 'error', text1: 'Location permission required', text2: 'Allow precise location before going online.' });
        return;
      }
''',
    '''      if (!permitted) {
        setLocating(false);
        Toast.show({ type: 'error', text1: 'Location permission required', text2: 'Allow precise and background location before going online.' });
        return;
      }
''',
)

admin = 'apps/admin-dashboard/src/app/(admin)/admin/dispatch/page.tsx'
replace_once(
    admin,
    '''  const availableRiders = useMemo(
    () => board.riders.filter((rider) => rider.available),
    [board.riders],
  );

  const openOfferByJob = useMemo(
''',
    '''  const riderIdsWithOpenOffer = useMemo(
    () =>
      new Set(
        board.openOffers
          .map((offer) => offer.riderProfile?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [board.openOffers],
  );

  const availableRiders = useMemo(
    () =>
      board.riders.filter(
        (rider) => rider.available && !riderIdsWithOpenOffer.has(rider.id),
      ),
    [board.riders, riderIdsWithOpenOffer],
  );

  const openOfferByJob = useMemo(
''',
)
replace_once(
    admin,
    '''    const riderUserId = selectedRiders[order.id];
    const deliveryJobId = order.deliveryJob?.id;
    if (!riderUserId || !deliveryJobId || openOfferByJob.has(deliveryJobId)) {
      return;
    }
''',
    '''    const riderUserId = selectedRiders[order.id];
    const deliveryJobId = order.deliveryJob?.id;
    const selectedRiderIsAvailable = availableRiders.some(
      (rider) => rider.userId === riderUserId,
    );
    if (
      !riderUserId ||
      !selectedRiderIsAvailable ||
      !deliveryJobId ||
      openOfferByJob.has(deliveryJobId)
    ) {
      return;
    }
''',
)

mobile_contract = 'apps/mobile-partners/src/riderOnlineAlarm.contract.spec.ts'
replace_once(
    mobile_contract,
    '''  it('rejects stale cached coordinates before sending availability heartbeats', () => {
''',
    '''  it('requires background permission before native recovery can collect GPS', () => {
    expect(source).toContain('Manifest.permission.ACCESS_BACKGROUND_LOCATION');
    expect(source).toContain('Build.VERSION.SDK_INT < Build.VERSION_CODES.Q');
    expect(source).toContain('BACKGROUND_LOCATION_PERMISSION_MISSING');
  });

  it('rejects stale cached coordinates before sending availability heartbeats', () => {
''',
)

api_contract = 'apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts'
replace_once(
    api_contract,
    '''    expect(nativeService).toContain('SERVER_MARKED_OFFLINE');
    expect(nativeModule).toContain('putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)');
    expect(manifest).toContain('android:foregroundServiceType="location"');
''',
    '''    expect(nativeService).toContain('SERVER_MARKED_OFFLINE');
    expect(nativeService).toContain('Manifest.permission.ACCESS_BACKGROUND_LOCATION');
    expect(nativeService).toContain('BACKGROUND_LOCATION_PERMISSION_MISSING');
    expect(nativeModule).toContain('putExtra(RiderOnlineService.EXTRA_AUTH_TOKEN, authToken)');
    expect(manifest).toContain('android.permission.ACCESS_BACKGROUND_LOCATION');
    expect(manifest).toContain('android:foregroundServiceType="location"');
''',
)
replace_once(
    api_contract,
    '''    expect(source).toContain('} else {');
    expect(source).toContain('RiderOnlineService.stop().catch');
''',
    '''    expect(source).toContain('} else {');
    expect(source).toContain('RiderOnlineService.stop().catch');
    expect(source).toContain('PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION');
    expect(source).toContain('PermissionsAndroid.request(backgroundPermission');
    expect(source).toContain('Linking.openSettings()');
''',
)
replace_once(
    api_contract,
    '''    expect(source).toContain('openOfferByJob.has(deliveryJobId)');
''',
    '''    expect(source).toContain('openOfferByJob.has(deliveryJobId)');
    expect(source).toContain('riderIdsWithOpenOffer');
    expect(source).toContain('!riderIdsWithOpenOffer.has(rider.id)');
    expect(source).toContain('selectedRiderIsAvailable');
''',
)

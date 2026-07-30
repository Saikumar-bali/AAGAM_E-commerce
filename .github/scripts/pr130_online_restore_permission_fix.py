from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:180]!r}")
    file.write_text(source.replace(old, new, 1))


dashboard = 'apps/mobile-partners/src/screens/rider/RiderDashboard.tsx'

replace_once(
    dashboard,
    '''  const [locating, setLocating] = useState(false);
  const [isOnline, setIsOnline] = useState(() => {
''',
    '''  const [locating, setLocating] = useState(false);
  const [onlinePermissionMissing, setOnlinePermissionMissing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => {
''',
)

replace_once(
    dashboard,
    '''  useEffect(() => {
    if (workspace?.rider?.status) {
      const online = workspace.rider.status !== 'OFFLINE';
      setIsOnline(online);
      // Ensure the foreground service matches the server-side status.
      if (online) {
        RiderOnlineService.start(user?.name || 'Rider').catch(() => undefined);
      } else {
        RiderOnlineService.stop().catch(() => undefined);
      }
    }
  }, [workspace?.rider?.status, user?.name]);
''',
    '''  useEffect(() => {
    if (workspace?.rider?.status) {
      const online = workspace.rider.status !== 'OFFLINE';
      setIsOnline(online);
      if (!online) {
        setOnlinePermissionMissing(false);
        RiderOnlineService.stop().catch(() => undefined);
      }
    }
  }, [workspace?.rider?.status]);
''',
)

permission_end = '''    return false;
  };

  const goOnline = async () => {
'''
permission_replacement = '''    return false;
  };

  const grantOnlinePermission = async () => {
    setLocating(true);
    try {
      const permitted = await requestLocationPermission();
      if (!permitted) {
        setOnlinePermissionMissing(true);
        await RiderOnlineService.stop().catch(() => undefined);
        Toast.show({
          type: 'error',
          text1: 'Background location required',
          text2: 'Grant “Allow all the time” to remain eligible while the app is in the background.',
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
        text2: error?.message || 'Could not start background Rider availability.',
      });
      return false;
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!workspace?.rider?.status || workspace.rider.status === 'OFFLINE') return;
    let cancelled = false;

    const restoreOnlineAvailability = async () => {
      const started = await grantOnlinePermission();
      if (cancelled || started) return;
      setOnlinePermissionMissing(true);
    };

    void restoreOnlineAvailability();
    return () => {
      cancelled = true;
    };
  }, [workspace?.rider?.status, user?.name]);

  const goOnline = async () => {
'''
replace_once(dashboard, permission_end, permission_replacement)

replace_once(
    dashboard,
    '''          onPress={isOnline ? goOffline : goOnline}
''',
    '''          onPress={onlinePermissionMissing ? grantOnlinePermission : isOnline ? goOffline : goOnline}
''',
)

replace_once(
    dashboard,
    '''            {isOnline ? 'ONLINE' : 'OFFLINE'}
''',
    '''            {onlinePermissionMissing ? 'GRANT LOCATION' : isOnline ? 'ONLINE' : 'OFFLINE'}
''',
)

contract = 'apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts'
replace_once(
    contract,
    '''    expect(source).toContain('PermissionsAndroid.request(backgroundPermission');
    expect(source).toContain('Linking.openSettings()');
''',
    '''    expect(source).toContain('PermissionsAndroid.request(backgroundPermission');
    expect(source).toContain('Linking.openSettings()');
    expect(source).toContain('onlinePermissionMissing');
    expect(source).toContain('const grantOnlinePermission = async () =>');
    expect(source).toContain('const restoreOnlineAvailability = async () =>');
    expect(source).toContain('onlinePermissionMissing ? grantOnlinePermission');
    expect(source).toContain("'GRANT LOCATION'");
''',
)

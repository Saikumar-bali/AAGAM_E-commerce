from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:120]!r}")
    file.write_text(source.replace(old, new, 1))


service = 'apps/mobile-partners/android/app/src/main/java/com/aagampartners/RiderOnlineService.kt'

replace_once(
    service,
    '    private const val HEARTBEAT_INTERVAL_MS = 60_000L\n',
    '    private const val HEARTBEAT_INTERVAL_MS = 60_000L\n'
    '    private const val AVAILABILITY_LOCATION_MAX_AGE_MS = 180_000L\n',
)

replace_once(
    service,
    '''  private fun sendHeartbeat(location: Location) {
    if (!configurationIsActive() || !sending.compareAndSet(false, true)) return
''',
    '''  private fun isFreshLocation(location: Location): Boolean {
    val capturedAt = location.time
    if (capturedAt <= 0L) return false
    val ageMs = System.currentTimeMillis() - capturedAt
    return ageMs in 0..AVAILABILITY_LOCATION_MAX_AGE_MS
  }

  private fun sendHeartbeat(location: Location) {
    if (!isFreshLocation(location)) {
      recordError("Ignored stale availability location")
      return
    }
    if (!configurationIsActive() || !sending.compareAndSet(false, true)) return
''',
)

contract = 'apps/mobile-partners/src/riderOnlineAlarm.contract.spec.ts'
replace_once(
    contract,
    '''  it('starts the service with the API-appropriate Android method', () => {
''',
    '''  it('rejects stale cached coordinates before sending availability heartbeats', () => {
    expect(source).toContain('AVAILABILITY_LOCATION_MAX_AGE_MS = 180_000L');
    expect(source).toContain('private fun isFreshLocation(location: Location)');
    expect(source).toContain('System.currentTimeMillis() - capturedAt');
    expect(source).toContain('if (!isFreshLocation(location))');
    expect(source).toContain('Ignored stale availability location');
  });

  it('starts the service with the API-appropriate Android method', () => {
''',
)

import fs from 'fs';
import path from 'path';
import { buildRiderMapHtml } from '../../components/rider/riderRouteMapHtml';

const read = (relativePath: string) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

/**
 * The full-screen map console is meant to be self-contained: a rider should be
 * able to record cash, attach extra milk, toggle the slot, skip/undo, and
 * capture the delivery proof without ever leaving the map. These assertions pin
 * that contract, and that every mutation routes through the same audited rider
 * endpoints as the compact sheet.
 */
describe('rider map console operations', () => {
  const console = read('RiderRunConsole.tsx');
  const service = read('../../api/subscriptionOperationsService.ts');

  it('records cash through the capped record-payment endpoint', () => {
    expect(console).toContain('recordStopPayment(run.id, stop.id');
    expect(console).toContain('amount > focusOutstanding');
    expect(service).toContain('record-payment');
    expect(service).toContain("paymentMode?: 'CASH' | 'PHONE_PE'");
  });

  it('reads the reconciled subscription due, not the raw day cell', () => {
    // A day cell can read ₹0 while the plan still owes (ledger drift / a skipped
    // funding day); the console must show the server-reconciled due
    // (outstandingDuePaise on the stop) and only call a stop Prepaid when that
    // collectable figure is zero. The cash pad caps at it (recordPayment's
    // server contract: per-day cap only when the cell itself still owes, else
    // the subscription due is the floor), while complete() keeps sending the
    // exact day figure the server demands.
    expect(console).toContain('reconciledDuePaise');
    expect(console).toContain('focusDayOutstanding > 0 ? focusDayOutstanding : reconciledDuePaise(focusedStop)');
    expect(console).toContain('stop.outstandingDuePaise || stop.cashDuePaise || 0');
    expect(console).toContain('cashCollectedPaise: outstanding > 0 ? outstanding : undefined');
    expect(console).toContain('focusDayOutstanding > 0 ? `Deliver · collect ${money(focusDayOutstanding)}` : \'Deliver\'');
  });

  it('attaches extra milk with an idempotency key', () => {
    expect(console).toContain('addExtraMilk(run.id, stop.id');
    expect(console).toContain('console-extra-');
    expect(console).toContain('consecutiveDays: extraDays');
    expect(console).toContain('targetSlot: extraDays > 1 ? extraSlot : undefined');
  });

  it('toggles the slot and skips / undoes inline', () => {
    expect(console).toContain('toggleStopSlot(run.id, stop.id');
    expect(console).toContain('skipStop(run.id, stop.id');
    expect(console).toContain('undoStop(run.id, stop.id');
    expect(service).toContain('toggle-slot');
  });

  it('never offers an Undo the server will refuse (COD-funded stops)', () => {
    // The server throws "COD-funded stops cannot be undone", so the button is
    // gated on a zero cash due, not just on a closed status.
    expect(console).toContain('const undoable = Boolean((focusDelivered || focusSkipped) && Number(focusedStop?.cashDuePaise || 0) <= 0)');
    expect(console).toContain('{undoable ? (');
  });

  it('captures proof inline (photo for photo-GPS, token + photo for Trusted Drop, OTP otherwise)', () => {
    expect(console).toContain("stop.proofMode === 'RIDER_PHOTO_GPS'");
    // proofMode's Trusted Drop value is the full enum member, not 'TRUSTED_DROP',
    // and a cash-due stop is never a Trusted Drop completion.
    expect(console).toContain('isTrustedDropStop(stop)');
    expect(console).toContain("stop.proofMode === 'TRUSTED_DROP_GEOFENCE_TOKEN_PHOTO'");
    expect(console).toContain('riderService.uploadEvidence');
    expect(console).toContain('issueStopOtp(run.id');
    expect(console).toContain('completeStop(run.id, stop.id');
  });

  it('is the single surface: the run screen mounts it inline with the board, not behind a button', () => {
    const detail = read('RiderRunDetailScreen.tsx');
    // The run screen *is* the board — the console is rendered directly.
    expect(detail).toContain('<RiderRunConsole');
    expect(detail).toContain('renderBoard={({ focusStop }) => board(focusStop)}');
    expect(detail).toContain('lifecycle={lifecycle}');
    // The old button-gated full-screen map (and its second map) is gone.
    expect(detail).not.toContain('rider_open_map_console');
    expect(detail).not.toContain('Open full-screen map console');
  });

  it('the board is a route-order overlay, not a second set of stop actions', () => {
    const detail = read('RiderRunDetailScreen.tsx');
    // Rows exist only to focus the console sheet and to hold the route order.
    expect(detail).toContain('function StopRow(');
    expect(detail).toContain('accessibilityLabel={`Focus stop ${stop.sequenceNumber}`}');
    expect(detail).toContain('onFocus={() => focusStop(stop.id)}');
    // Reorder (including its offline queue) lives on the board, and terminal
    // stops keep their position (the server rejects those reorders).
    expect(detail).toContain("kind: 'REORDER'");
    expect(detail).toContain("const actionable = !['DELIVERED', 'CANCELLED', 'FAILED', 'RETURNED'].includes(stop.status)");
    expect(detail).toContain('index > 0 && actionable && !reorderMutation.isPending');
    // ...and Finish + cash settlement are the two actions the sheet cannot do.
    expect(detail).toContain('Finish route after all stops');
    expect(detail).toContain('Create deposit batch');
    // Every per-stop mutation moved into the console's focused-stop sheet:
    // none of them may reappear on the run screen (the duplicate the board
    // was deduplicating).
    expect(detail).not.toContain('completeStop(');
    expect(detail).not.toContain('failStop(');
    expect(detail).not.toContain('skipStop(');
    expect(detail).not.toContain('undoStop(');
    expect(detail).not.toContain('recordStopPayment(');
    expect(detail).not.toContain('addExtraMilk(');
    expect(detail).not.toContain('toggleStopSlot(');
    expect(detail).not.toContain('arriveAtStop(');
    expect(detail).not.toContain('PartnerQrScanner');
    expect(detail).not.toContain('RiderRouteMap');
    expect(detail).not.toContain('showFullStop');
  });

  it('keeps offline parity: the console queues ARRIVE and FAIL like the board queues REORDER', () => {
    const detail = read('RiderRunDetailScreen.tsx');
    // The legacy modal owned the offline enqueue for arrival/failure; now that
    // the modal is gone, those two queues must live in the console instead.
    expect(console).toContain("kind: 'ARRIVE'");
    expect(console).toContain("kind: 'FAIL'");
    expect(console).toContain('RiderRunOfflineQueue.enqueue');
    expect(console).toContain('PartnerConnectivity.getCurrent()');
    // The queue callback keeps the run screen's pending chip fresh even when
    // there is no connectivity transition to trigger the subscriber.
    expect(console).toContain('onOfflineQueued?.()');
    expect(detail).toContain('onOfflineQueued=');
  });

  it('exposes one draggable sheet with a route-board snap point', () => {
    expect(console).toContain('PanResponder.create');
    expect(console).toContain('sheetTranslate');
    expect(console).toContain('sheetGrip');
    expect(console).toContain('Drag up for the route board');
    expect(console).toContain('renderBoard ? <View style={styles.boardHost}>');
  });

  it('maximises the map and docks the primary actions at the screen bottom', () => {
    // The console map is chromeless: no card header/footer, the WebView is the
    // whole layer and the nav tools float above the sheet.
    expect(console).toContain('chromeless');
    expect(console).toContain('controlsBottom');
    const routeMap = read('../../components/rider/RiderRouteMap.tsx');
    expect(routeMap).toContain('chromeless?: boolean');
    expect(routeMap).toContain('styles.bare');
    // Navigate / Deliver live in a dock pinned to the screen bottom, so the
    // board can never push them off-screen or under a menu.
    expect(console).toContain('styles.dock');
    expect(console).toContain('accessibilityLabel="Deliver this stop"');
    // The tab menu is hidden while the rider is inside the full-screen console.
    const navigator = read('../../navigation/RiderNavigator.tsx');
    expect(navigator).toContain("name=\"RiderRunDetail\" component={RiderRunDetailScreen} options={{ ...hidden, tabBarStyle: { display: 'none' } }}");
  });
});

describe('rider map stop signals', () => {
  it('skins markers and badges for delivered / part-paid / skipped / extra', () => {
    const html = buildRiderMapHtml({ latitude: 17.69, longitude: 83.0 }, 'Store', null, {
      stops: [
        { latitude: 17.69, longitude: 83.0, sequence: 1, id: 'a', label: 'A', status: 'DELIVERED', cashDuePaise: 49000, cashPaidPaise: 49000, state: 'done' },
        { latitude: 17.691, longitude: 83.001, sequence: 2, id: 'b', label: 'B', status: 'READY', cashDuePaise: 49000, cashPaidPaise: 20000, extraCount: 2, state: 'current' },
        { latitude: 17.692, longitude: 83.002, sequence: 3, id: 'c', label: 'C', status: 'CANCELLED', skipped: true, state: 'upcoming' },
      ],
    });
    expect(html).toContain("'stop-marker");
    expect(html).toContain('delivered');
    expect(html).toContain('partial');
    expect(html).toContain('stop-badge');
    expect(html).toContain('map-legend');
    expect(html).toContain('extra-milk');
    // The stop-tap message contract the RN layer reads must survive.
    expect(html).toContain("type: 'stop-tap'");
  });

  it('shows a Google-Maps-style ETA chip whenever a road route is loaded', () => {
    const html = buildRiderMapHtml({ latitude: 17.69, longitude: 83.0 }, 'Store', null, {
      stops: [{ latitude: 17.691, longitude: 83.001, sequence: 1, id: 'a', label: 'A', status: 'READY', state: 'current' }],
      fallbackOrigin: { latitude: 17.68, longitude: 82.99 },
    });
    expect(html).toContain('id="map-eta"');
    expect(html).toContain('updateEtaChip');
    // The directions duration/distance were fetched but never surfaced before;
    // the chip scales them by the remaining route ratio.
    expect(html).toContain('Number(route.duration)');
    expect(html).toContain('Number(route.distance)');
    // The console passes the run's store as the route origin, so the blue line
    // + ETA render even before the first GPS tick (single-stop runs used to
    // show no line at all without a rider fix).
    expect(html).toContain('var fallbackOrigin = [82.99,17.68]');
    expect(html).toContain('function routeOrigin()');
    const consoleSource = read('RiderRunConsole.tsx');
    expect(consoleSource).toContain('fallbackOrigin={Number.isFinite(run.store?.latitude)');
    // Navigation mode must accept the fallback origin too, not only a GPS fix.
    expect(html).toContain('var from = routeOrigin();');
  });
});

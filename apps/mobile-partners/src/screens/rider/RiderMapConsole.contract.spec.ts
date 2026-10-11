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

  it('captures proof inline (photo for photo-GPS, OTP otherwise) and defers Trusted Drop', () => {
    expect(console).toContain("stop.proofMode === 'RIDER_PHOTO_GPS'");
    expect(console).toContain("stop.proofMode === 'TRUSTED_DROP'");
    expect(console).toContain('riderService.uploadEvidence');
    expect(console).toContain('issueStopOtp(run.id');
    expect(console).toContain('completeStop(run.id, stop.id');
  });

  it('is the single surface: the run screen mounts it inline with the board, not behind a button', () => {
    const detail = read('RiderRunDetailScreen.tsx');
    // The run screen *is* the board — the console is rendered directly.
    expect(detail).toContain('<RiderRunConsole');
    expect(detail).toContain('renderBoard={() => board}');
    expect(detail).toContain('lifecycle={lifecycle}');
    // The old button-gated full-screen map (and its second map) is gone.
    expect(detail).not.toContain('rider_open_map_console');
    expect(detail).not.toContain('Open full-screen map console');
  });

  it('exposes one draggable sheet with a route-board snap point', () => {
    expect(console).toContain('PanResponder.create');
    expect(console).toContain('sheetTranslate');
    expect(console).toContain('sheetGrip');
    expect(console).toContain('Drag up for the route board');
    expect(console).toContain('renderBoard ? <View style={styles.boardHost}>');
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
});

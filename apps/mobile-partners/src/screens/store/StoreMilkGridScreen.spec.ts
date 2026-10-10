import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'StoreMilkGridScreen.tsx'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'subscriptionOperationsService.ts'), 'utf8');

describe('StoreMilkGridScreen — operational console parity with the web grid', () => {
  it('exposes every quick action the web milk grid supports', () => {
    for (const action of [
      'TOGGLE_DELIVERED',
      'SKIP',
      'TOGGLE_SLOT',
      'RECORD_PAYMENT',
      'VOID_PAYMENT',
      'EXTRA_MILK',
      'ATTACH_EVENING_MILK',
    ]) {
      expect(source).toContain(action);
    }
  });

  it('routes quick actions through the shared service, not an inline client', () => {
    expect(source).toContain('subscriptionOperationsService.quickAction');
    expect(service).toContain('store/subscriptions/deliveries/');
    expect(service).toContain('quick-action');
  });

  it('offers the operational toolbar actions from the web sheet view', () => {
    expect(source).toContain('exportGridCsv');
    expect(source).toContain('getDispatchSummary');
    expect(source).toContain('getCustomerStatement');
    expect(source).toContain('renewThirtyDays');
  });

  it('supports the grid filters the web sheet view provides', () => {
    expect(source).toContain('slotFilter');
    expect(source).toContain('dueOnly');
    expect(source).toContain('channel');
    expect(source).toContain('Search customer, phone, locality');
  });

  it('keeps the add-on flow with unit modes, duration and shift target', () => {
    expect(source).toContain('ADDON_PRESETS');
    expect(source).toContain('addonMode');
    expect(source).toContain('addonDays');
    expect(source).toContain('addonSlot');
  });

  it('surfaces proof-of-delivery evidence via the upload service', () => {
    expect(source).toContain('getEvidenceUrl');
    expect(service).toContain("'/upload/evidence-url'");
  });
});

describe('subscriptionOperationsService — new store grid endpoints', () => {
  it('targets the same store endpoints the web grid uses', () => {
    expect(service).toContain('store/subscriptions/grid/export-csv');
    expect(service).toContain('store/subscriptions/dispatch-summary');
    expect(service).toContain('store/subscriptions/customer/');
    expect(service).toContain('/statement');
    expect(service).toContain('store/subscriptions/subscribers/');
    expect(service).toContain('/renew');
    expect(service).toContain('/temporary-rider');
  });
});

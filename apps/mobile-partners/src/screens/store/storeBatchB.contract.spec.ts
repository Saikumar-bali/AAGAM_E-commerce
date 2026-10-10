import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf8');

const service = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'subscriptionOperationsService.ts'), 'utf8');
const navigator = fs.readFileSync(path.join(__dirname, '..', '..', 'navigation', 'StoreNavigator.tsx'), 'utf8');
const more = read('StoreMoreScreen.tsx');
const subsHub = read('StoreSubscriptionsHubScreen.tsx');
const subscribers = read('StoreSubscribersScreen.tsx');
const manage = read('ManageSubscriberSheet.tsx');

describe('Batch B — new store screens are registered and reachable', () => {
  it('registers calendar, analytics, operating hours, notification prefs and deliveries', () => {
    for (const name of [
      'StoreCalendar',
      'StoreAnalytics',
      'StoreOperatingHours',
      'StoreNotificationSettings',
      'StoreDeliveries',
    ]) {
      expect(navigator).toContain(`name="${name}"`);
    }
  });

  it('exposes entry points from the More hub', () => {
    expect(more).toContain("navigation.navigate('StoreDeliveries')");
    expect(more).toContain("navigation.navigate('StoreCalendar')");
    expect(more).toContain("navigation.navigate('StoreAnalytics')");
    expect(more).toContain("navigation.navigate('StoreOperatingHours')");
    expect(more).toContain("navigation.navigate('StoreNotificationSettings')");
  });

  it('exposes calendar and analytics from the subscriptions hub', () => {
    expect(subsHub).toContain("navigation.navigate('StoreCalendar')");
    expect(subsHub).toContain("navigation.navigate('StoreAnalytics')");
  });
});

describe('Manage-subscriber parity with the web "Manage" modal', () => {
  it('covers every lifecycle action', () => {
    for (const token of ['renewSubscription', 'updateSubscription', 'recordSubscriberPayment', 'cancelSubscription', 'getSubscriberHistory']) {
      expect(manage).toContain(token);
    }
  });

  it('offers renewal types, vacation, frequency and slot editing', () => {
    expect(manage).toContain('Split AM / PM');
    expect(manage).toContain('vacationRange');
    expect(manage).toContain('ALTERNATE_DAYS');
    expect(manage).toContain('deliverySlot');
    expect(manage).toContain('initialCashCollectedPaise');
  });
});

describe('subscriptionOperationsService — batch B endpoints', () => {
  it('targets the same endpoints the web store uses', () => {
    for (const frag of [
      '/store/subscriptions/analytics',
      '/store/subscriptions/calendar',
      '/store/subscriptions/subscribers/',
      '/cancel',
      '/record-payment',
      '/manual-edit',
      '/history',
      '/audit',
      '/store-owner/stores/',
      '/operating-hours',
      '/notifications/preferences',
      '/store-self-delivery/queue/',
      '/store-self-delivery/start/',
      '/store-self-delivery/complete/',
      '/store-self-delivery/fail/',
      '/store-self-delivery/update/',
    ]) {
      expect(service).toContain(frag);
    }
  });
});

describe('Subscribers screen upgrade', () => {
  it('adds search, source filter and row actions to the list', () => {
    expect(subscribers).toContain('Search name, phone or plan');
    expect(subscribers).toContain('SOURCES');
    expect(subscribers).toContain('<ManageSubscriberSheet');
    expect(subscribers).toContain('ManageSubscriberSheet');
  });
});

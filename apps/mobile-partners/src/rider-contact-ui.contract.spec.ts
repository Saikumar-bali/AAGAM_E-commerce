import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '../../..');
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

describe('Rider active-delivery contact and toast UI contract', () => {
  it('uses the delivery-address phone directly without a relay dependency', () => {
    const source = read('apps/api-gateway/src/riders/rider-portal-read.service.ts');
    expect(source).toContain('(job.order.addressSnapshot as any)?.phoneE164');
    expect(source).toContain('addressPhone || job.order.customer.phone');
    expect(source).toContain('`tel:${targetPhone}`');
    expect(source).toContain('`sms:${targetPhone}`');
    expect(source).not.toContain('RIDER_CONTACT_RELAY_NUMBER');

    const secure = read('apps/api-gateway/src/riders/rider-portal-secure.service.ts');
    expect(secure).toContain('return this.read.contact(userId, deliveryJobId, input);');
    expect(secure).not.toContain('RIDER_CONTACT_RELAY_UNAVAILABLE');
    expect(secure).not.toContain('ServiceUnavailableException');
  });

  it('shows direct Call/Message controls and keeps toasts below the device safe area', () => {
    const screen = read('apps/mobile-partners/src/screens/rider/RiderDeliveryFlowScreen.tsx');
    const app = read('apps/mobile-partners/App.tsx');
    expect(screen).toContain('Delivery contact');
    expect(screen).toContain('phone number saved with the customer delivery address');
    expect(screen).toContain('>Call</Text>');
    expect(screen).toContain('>Message</Text>');
    expect(app).toContain('useSafeAreaInsets');
    expect(app).toContain('topOffset={insets.top + 8}');
    expect(app).toContain('<PartnerToastHost />');
  });
});

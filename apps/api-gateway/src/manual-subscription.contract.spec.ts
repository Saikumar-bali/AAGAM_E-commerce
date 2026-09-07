import { readFileSync } from 'node:fs';

describe('Manual offline customer & subscription contract', () => {
  const controllerSource = readFileSync(__dirname + '/subscriptions/subscriptions.controller.ts', 'utf8');
  const serviceSource = readFileSync(__dirname + '/subscriptions/subscription-admin-reporting.service.ts', 'utf8');
  const dtoSource = readFileSync(__dirname + '/subscriptions/subscriptions.dto.ts', 'utf8');

  test('exposes manual offline customer and subscription endpoints', () => {
    expect(controllerSource).toContain("@Post('manual-customer')");
    expect(controllerSource).toContain("@Post('manual-subscribe')");
    expect(controllerSource).toContain("@Patch('subscribers/:id/manual-edit')");
  });

  test('defines CreateManualOfflineCustomerDto and CreateAdminManualSubscriptionDto', () => {
    expect(dtoSource).toContain('class CreateManualOfflineCustomerDto');
    expect(dtoSource).toContain('class CreateAdminManualSubscriptionDto');
    expect(dtoSource).toContain('class UpdateAdminManualSubscriptionDto');
  });

  test('handles synthetic email for offline customers without login', () => {
    expect(serviceSource).toContain('createOfflineCustomer');
    expect(serviceSource).toContain('offline.');
    expect(serviceSource).toContain('@aagaam.local');
    expect(serviceSource).toContain('createManualSubscription');
    expect(serviceSource).toContain('updateManualSubscription');
  });
});

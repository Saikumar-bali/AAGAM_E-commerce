import fs from 'fs';
import path from 'path';

describe('first-order free delivery contract', () => {
  const checkout = fs.readFileSync(path.join(__dirname, 'checkout.service.ts'), 'utf8');
  const pricing = fs.readFileSync(path.join(__dirname, 'delivery-pricing.ts'), 'utf8');
  const bill = fs.readFileSync(
    path.resolve(__dirname, '../../../admin-dashboard/src/components/customer/BillDetailsCard.tsx'),
    'utf8',
  );

  it('derives eligibility from non-cancelled, non-failed customer orders', () => {
    expect(checkout).toContain("customerId: userId");
    expect(checkout).toContain("status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] as any }");
    expect(checkout).toContain('const firstOrderEligible = !priorOrder');
  });

  it('revalidates the one-time offer inside the serializable order transaction', () => {
    expect(checkout).toContain('const transactionFirstOrderEligible = !transactionPriorOrder');
    expect(checkout).toContain("First-order delivery offer changed. Refresh checkout and try again.");
    expect(checkout).toContain('Prisma.TransactionIsolationLevel.Serializable');
  });

  it('charges ₹2/km for later sub-threshold orders and clearly labels the first-order waiver', () => {
    expect(pricing).toContain('DELIVERY_RATE_PAISE_PER_KM = 200');
    expect(pricing).toContain('waivedByFirstOrder');
    expect(bill).toContain('First order — FREE delivery');
    expect(bill).toContain('Delivery fee · First order free');
  });
});

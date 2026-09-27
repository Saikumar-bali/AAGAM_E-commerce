const fs = require('fs');
const path = require('path');

const source = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

const GREEN = '#0C7659';

// The subscription surfaces must share one green. #0C7659 is the green the
// review screen already paints the plan name (e.g. COW MILK 1/4L 15 DAYS) on;
// every subscription hero and primary action now reads the same theme token.
describe('customer subscription green branding contract', () => {
  const theme = source('../../../../../packages/mobile-shared/src/constants/theme.ts');

  it('exposes the subscription green as a shared theme token', () => {
    expect(theme).toContain(`brandGreen: '${GREEN}'`);
  });

  it('paints the review plan card and request button with the brand green', () => {
    const review = source('SubscriptionReviewScreen.tsx');
    expect(review).toContain("import { COLORS } from '@aagam/mobile-shared'");
    expect(review).toMatch(/planCard:\s*\{[^}]*backgroundColor:\s*COLORS\.brandGreen/);
    expect(review).toMatch(/submit:\s*\{[^}]*backgroundColor:\s*COLORS\.brandGreen/);
  });

  it('paints the Subscribe & Save hero and choose-plan button with the brand green', () => {
    const plans = source('SubscriptionPlansScreen.tsx');
    expect(plans).toMatch(/hero:\s*\{[^}]*backgroundColor:\s*COLORS\.brandGreen/);
    expect(plans).toMatch(/cta:\s*\{[^}]*backgroundColor:\s*COLORS\.brandGreen/);
  });

  it('paints the shop Subscribe & Save hero with the brand green', () => {
    const shop = source('ShopScreen.tsx');
    expect(shop).toMatch(/subscriptionHero:\s*\{[^}]*backgroundColor:\s*COLORS\.brandGreen/);
  });
});

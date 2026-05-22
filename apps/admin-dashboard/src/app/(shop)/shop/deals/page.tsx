import CustomerFeaturePage from '@/components/CustomerFeaturePage';

export default function DealsPage() {
  return (
    <CustomerFeaturePage
      eyebrow="Promotions"
      title="Deals, coupons, and merchandising"
      description="This surface will host campaigns, coupons, bank offers, free delivery rules, and curated quick-commerce collections."
      features={[
        { title: 'Coupon wallet', description: 'Show eligible, used, expired, and minimum-cart coupons with clear savings.' },
        { title: 'Category deals', description: 'Promote fruits, dairy, snacks, staples, and household bundles.' },
        { title: 'Personalized offers', description: 'Recommend repeat-purchase and abandoned-cart offers based on customer behaviour.' },
      ]}
    />
  );
}

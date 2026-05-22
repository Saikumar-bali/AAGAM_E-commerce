import CustomerFeaturePage from '@/components/CustomerFeaturePage';

export default function AccountPage() {
  return (
    <CustomerFeaturePage
      eyebrow="Customer profile"
      title="Account, preferences, and support"
      description="A polished customer account area should centralize profile details, communication preferences, payment history, and support."
      features={[
        { title: 'Profile management', description: 'Edit name, phone, email, default address, and notification preferences.' },
        { title: 'Support center', description: 'Raise order issues, delivery concerns, payment questions, and refund requests later.' },
        { title: 'Payment history', description: 'Track COD, online payments, failed payments, invoices, and future wallet credits.' },
      ]}
    />
  );
}

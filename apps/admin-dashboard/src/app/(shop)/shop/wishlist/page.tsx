import CustomerFeaturePage from '@/components/CustomerFeaturePage';

export default function WishlistPage() {
  return (
    <CustomerFeaturePage
      eyebrow="Saved products"
      title="Wishlist and favourites workspace"
      description="A professional ecommerce app should let customers save products, monitor stock, and move favourites into cart quickly."
      features={[
        { title: 'Saved essentials', description: 'Pin daily-use groceries, dairy, snacks, and household products for one-tap shopping.' },
        { title: 'Back-in-stock alerts', description: 'Notify customers when saved unavailable products become serviceable again.' },
        { title: 'Price watch', description: 'Surface discounts and coupon eligibility for wishlist items.' },
      ]}
    />
  );
}

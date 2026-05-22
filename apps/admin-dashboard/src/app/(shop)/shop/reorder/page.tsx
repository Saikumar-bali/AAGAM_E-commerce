import CustomerFeaturePage from '@/components/CustomerFeaturePage';

export default function ReorderPage() {
  return (
    <CustomerFeaturePage
      eyebrow="Repeat basket"
      title="Reorder from previous purchases"
      description="Customers should not rebuild the same grocery cart every week. This page will make repeat orders fast and stock-aware."
      features={[
        { title: 'Past baskets', description: 'Convert delivered orders into ready-to-add carts with current price and stock validation.' },
        { title: 'Frequently bought', description: 'Group customer favourites like milk, eggs, onions, curd, and bread.' },
        { title: 'Smart substitutions', description: 'Suggest alternate brands or pack sizes when an old item is out of stock.' },
      ]}
    />
  );
}

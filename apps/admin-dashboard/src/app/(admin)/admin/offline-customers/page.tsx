import { redirect } from 'next/navigation';

// Offline customers now live as a tab of /admin/customers.
export default function OfflineCustomersRedirectPage() {
  redirect('/admin/customers?tab=offline');
}

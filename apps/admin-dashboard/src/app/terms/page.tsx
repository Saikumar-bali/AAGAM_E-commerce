import Link from 'next/link';

const sections = [
  {
    title: 'Using Aagaam',
    body: 'Aagaam provides a digital storefront and fulfilment experience for browsing products, placing orders, managing eligible subscriptions, and receiving deliveries. You must use the service lawfully and provide accurate information needed to fulfil your requests.',
  },
  {
    title: 'Accounts and security',
    body: 'You are responsible for keeping access to your account secure and for activity performed through your account. If you believe your account has been used without permission, use the available support flow as soon as possible.',
  },
  {
    title: 'Products, prices, offers and availability',
    body: 'Product availability, selling price, MRP, discounts, coupons, delivery charges and serviceability are determined by the current catalogue and platform rules shown during your shopping or checkout flow. Availability and offer eligibility can change before an order is completed.',
  },
  {
    title: 'Orders and fulfilment',
    body: 'Submitting an order requests fulfilment through Aagaam and its participating stores and delivery operations. The order screens provide the current status, amounts and delivery information for that transaction. An order may be unable to proceed when inventory, serviceability, payment, capacity or other required fulfilment conditions are not met.',
  },
  {
    title: 'Subscriptions',
    body: 'Where subscription plans are offered, the plan details shown before enrolment describe the products, schedule, price and available funding or payment options. Customers can use the subscription screens to view and manage supported subscription actions.',
  },
  {
    title: 'Support, cancellations and refunds',
    body: 'Available cancellation, return, refund and support actions depend on the order or subscription state and the options presented by the service. Use the Aagaam support and order-management screens for the current options applicable to your transaction.',
  },
  {
    title: 'Changes to the service',
    body: 'Aagaam may update features, catalogue content, service areas and these terms as the service evolves. The current public version of these terms is the version presented on this page.',
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f5f8f6] text-slate-900">
      <header className="border-b border-white/10 bg-[#063b3a] text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" className="font-serif text-2xl font-bold">Aagaam</Link>
          <Link href="/" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-bold hover:bg-white/10">Back to home</Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-10 sm:py-14">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Public notice</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Last updated: 23 August 2026</p>
        <p className="mt-6 text-base font-medium leading-7 text-slate-600">
          These terms describe the basic conditions for using the Aagaam storefront and fulfilment service. Transaction-specific prices, availability, delivery details and eligible actions are shown in the relevant product, checkout, order or subscription flow.
        </p>

        <div className="mt-10 space-y-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black">{section.title}</h2>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-600">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm font-bold">
          <Link href="/privacy" className="rounded-xl bg-[#087765] px-4 py-2.5 text-white">Read Privacy Policy</Link>
          <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700">Return to Aagaam</Link>
        </div>
      </article>
    </main>
  );
}

import Link from 'next/link';

const sections = [
  {
    title: 'Information used by the service',
    body: 'Aagaam uses information needed to operate customer accounts and commerce flows, such as account and contact details, delivery addresses, order and subscription information, support interactions, delivery status and related operational records.',
  },
  {
    title: 'How information is used',
    body: 'Information is used to provide account access, show the catalogue, process and fulfil orders, coordinate stores and delivery operations, manage subscriptions, provide support, maintain service security, prevent abuse and keep transaction records consistent.',
  },
  {
    title: 'Payments',
    body: 'Payment processing may involve payment service providers. Aagaam may retain the payment status and transaction references needed to associate a payment with an order or subscription, rather than presenting payment credentials as part of the public storefront.',
  },
  {
    title: 'Sharing for fulfilment',
    body: 'Information necessary to complete a transaction may be made available to the participating store, delivery personnel and service providers that support the relevant fulfilment, communication, infrastructure or payment function. Access should be limited to what is needed for that function.',
  },
  {
    title: 'Security and retention',
    body: 'Aagaam uses access controls and operational safeguards designed to protect service data. Records may be retained for as long as needed to operate the service, support transactions, address security or disputes, and meet applicable record-keeping obligations.',
  },
  {
    title: 'Your choices',
    body: 'Use the available account, address, order, subscription and support screens to review or manage information and actions exposed by the service. If a requested change is not available through those screens, use the support flow provided in Aagaam.',
  },
  {
    title: 'Updates to this notice',
    body: 'This notice may be updated as Aagaam features and data flows change. The current public version is the version displayed on this page.',
  },
];

export default function PrivacyPage() {
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
        <h1 className="mt-3 text-4xl font-black tracking-tight">Privacy Policy</h1>
        <p className="mt-3 text-sm font-semibold text-slate-500">Last updated: 23 August 2026</p>
        <p className="mt-6 text-base font-medium leading-7 text-slate-600">
          This notice explains, at a practical level, the information Aagaam uses to operate its customer storefront, order fulfilment, subscriptions, delivery operations and support experience.
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
          <Link href="/terms" className="rounded-xl bg-[#087765] px-4 py-2.5 text-white">Read Terms &amp; Conditions</Link>
          <Link href="/" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700">Return to Aagaam</Link>
        </div>
      </article>
    </main>
  );
}

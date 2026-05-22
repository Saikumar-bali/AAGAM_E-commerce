'use client';

import DashboardLayout from './DashboardLayout';

type Feature = {
  title: string;
  description: string;
};

type CustomerFeaturePageProps = {
  eyebrow: string;
  title: string;
  description: string;
  features: Feature[];
};

export default function CustomerFeaturePage({ eyebrow, title, description, features }: CustomerFeaturePageProps) {
  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <section className="enterprise-panel overflow-hidden">
        <div className="bg-gradient-to-br from-emerald-50 via-white to-amber-50 p-6 md:p-8">
          <p className="enterprise-kicker w-fit">{eyebrow}</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.055em] text-slate-950 md:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600">{description}</p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <div key={feature.title} className="rounded-[1.5rem] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white">0{index + 1}</div>
              <h2 className="mt-5 text-lg font-black tracking-tight text-slate-950">{feature.title}</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>
    </DashboardLayout>
  );
}

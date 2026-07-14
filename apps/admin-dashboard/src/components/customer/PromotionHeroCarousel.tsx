"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgePercent,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { PromotionCampaign } from "./promotion-types";

export default function PromotionHeroCarousel({
  campaigns,
}: {
  campaigns: PromotionCampaign[];
}) {
  const [active, setActive] = useState(0);
  const router = useRouter();

  useEffect(() => {
    setActive((current) =>
      Math.min(current, Math.max(campaigns.length - 1, 0))
    );
    if (campaigns.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % campaigns.length),
      6000
    );
    return () => window.clearInterval(timer);
  }, [campaigns.length]);

  if (!campaigns.length) {
    return (
      <section
        data-testid="promotion-hero-empty"
        className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm"
      >
        <BadgePercent className="mx-auto h-8 w-8 text-teal-600" />
        <h1 className="mt-3 text-2xl font-black text-slate-950">
          Fresh essentials, delivered quickly
        </h1>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          There are no active featured campaigns right now. Browse the live
          catalog below.
        </p>
      </section>
    );
  }

  const campaign = campaigns[active];
  const go = () => campaign.targetUrl && router.push(campaign.targetUrl);
  return (
    <section
      data-testid="promotion-hero"
      className="group relative min-h-[290px] overflow-hidden rounded-3xl px-6 py-8 shadow-sm md:min-h-[330px] md:px-10 md:py-10"
      style={{
        backgroundColor: campaign.backgroundColor,
        color: campaign.textColor,
      }}
    >
      {(campaign.imageUrl || campaign.mobileImageUrl) && (
        <picture className="absolute inset-0">
          {campaign.mobileImageUrl && (
            <source
              media="(max-width: 640px)"
              srcSet={campaign.mobileImageUrl}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={campaign.imageUrl || campaign.mobileImageUrl || ""}
            alt=""
            className="h-full w-full object-cover"
          />
        </picture>
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/35 to-transparent" />
      <div className="relative z-10 flex min-h-[225px] max-w-2xl flex-col justify-center">
        {campaign.badgeText && (
          <span className="w-fit rounded-full border border-white/25 bg-black/20 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] backdrop-blur">
            {campaign.badgeText}
          </span>
        )}
        <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight md:text-5xl">
          {campaign.title}
        </h1>
        {campaign.subtitle && (
          <p className="mt-3 max-w-xl text-base font-bold opacity-90 md:text-lg">
            {campaign.subtitle}
          </p>
        )}
        {campaign.description && (
          <p className="mt-2 max-w-xl text-sm font-semibold opacity-75">
            {campaign.description}
          </p>
        )}
        {campaign.targetUrl && (
          <button
            onClick={go}
            className="mt-6 inline-flex w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-slate-950 shadow-lg transition-transform hover:-translate-y-0.5"
            style={{ backgroundColor: campaign.accentColor }}
          >
            {campaign.ctaLabel} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {campaigns.length > 1 && (
        <>
          <button
            aria-label="Previous campaign"
            onClick={() =>
              setActive((active - 1 + campaigns.length) % campaigns.length)
            }
            className="absolute left-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next campaign"
            onClick={() => setActive((active + 1) % campaigns.length)}
            className="absolute right-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {campaigns.map((item, index) => (
              <button
                key={item.id}
                aria-label={`Show campaign ${index + 1}`}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all ${
                  index === active ? "w-7 bg-white" : "w-2 bg-white/45"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

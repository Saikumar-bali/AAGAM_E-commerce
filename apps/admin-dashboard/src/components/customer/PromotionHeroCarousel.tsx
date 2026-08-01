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
  campaigns?: PromotionCampaign[];
}) {
  const [active, setActive] = useState(0);
  const router = useRouter();
  const visibleCampaigns = Array.isArray(campaigns) ? campaigns : [];

  useEffect(() => {
    setActive((current) =>
      Math.min(current, Math.max(visibleCampaigns.length - 1, 0))
    );
    if (visibleCampaigns.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % visibleCampaigns.length),
      6000
    );
    return () => window.clearInterval(timer);
  }, [visibleCampaigns.length]);

  if (!visibleCampaigns.length) {
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

  const safeActive = Math.min(active, visibleCampaigns.length - 1);
  const campaign = visibleCampaigns[safeActive];
  const go = () => campaign.targetUrl && router.push(campaign.targetUrl);
  return (
    <section
      data-testid="promotion-hero"
      className="group relative min-h-[330px] overflow-hidden rounded-[2rem] border border-white/20 px-6 py-9 shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] md:min-h-[390px] md:px-12 md:py-12"
      style={{
        backgroundColor: campaign.backgroundColor,
        color: "#FFFFFF",
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
            className="h-full w-full object-cover object-center transition duration-700 group-hover:scale-[1.015]"
          />
        </picture>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,18,35,0.98)_0%,rgba(3,28,39,0.88)_35%,rgba(3,28,39,0.28)_64%,rgba(3,18,35,0.04)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/25 via-transparent to-white/5" />
      <div className="relative z-10 flex min-h-[258px] max-w-[560px] flex-col justify-center md:min-h-[294px]">
        {campaign.badgeText && (
          <span className="w-fit rounded-full border border-teal-200/35 bg-teal-300/10 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-teal-100 backdrop-blur-md">
            {campaign.badgeText}
          </span>
        )}
        <h1 className="mt-5 max-w-[540px] text-[2.15rem] font-black leading-[1.04] tracking-[-0.045em] text-white drop-shadow-sm md:text-[3.4rem]">
          {campaign.title}
        </h1>
        {campaign.subtitle && (
          <p className="mt-4 max-w-lg text-sm font-semibold leading-6 text-slate-100 md:text-lg md:leading-7">
            {campaign.subtitle}
          </p>
        )}
        {campaign.description && (
          <p className="mt-2 max-w-lg text-xs font-medium leading-5 text-slate-300 md:text-sm">
            {campaign.description}
          </p>
        )}
        {campaign.targetUrl && (
          <button
            onClick={go}
            className="mt-7 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-slate-950/20 transition-all hover:-translate-y-0.5 hover:bg-teal-50"
          >
            {campaign.ctaLabel} <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      {visibleCampaigns.length > 1 && (
        <>
          <button
            aria-label="Previous campaign"
            onClick={() =>
              setActive((active - 1 + visibleCampaigns.length) % visibleCampaigns.length)
            }
            className="absolute left-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            aria-label="Next campaign"
            onClick={() => setActive((active + 1) % visibleCampaigns.length)}
            className="absolute right-3 top-1/2 z-20 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-black/25 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1.5">
            {visibleCampaigns.map((item, index) => (
              <button
                key={item.id}
                aria-label={`Show campaign ${index + 1}`}
                onClick={() => setActive(index)}
                className={`h-2 rounded-full transition-all ${
                  index === safeActive ? "w-7 bg-white" : "w-2 bg-white/45"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

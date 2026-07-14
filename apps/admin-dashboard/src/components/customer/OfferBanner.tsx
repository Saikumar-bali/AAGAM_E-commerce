"use client";

import React from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import type { PromotionCampaign } from "./promotion-types";

export default function OfferBanner({
  campaigns,
}: {
  campaigns: PromotionCampaign[];
}) {
  const router = useRouter();
  if (!campaigns.length) {
    return (
      <div
        data-testid="today-offers-empty"
        className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-6 text-sm font-bold text-slate-500"
      >
        No Today&apos;s Offers are active. New campaigns will appear here when
        published.
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
      {campaigns.map((offer) => (
        <button
          type="button"
          key={offer.id}
          onClick={() => offer.targetUrl && router.push(offer.targetUrl)}
          disabled={!offer.targetUrl}
          className="group relative w-[280px] shrink-0 overflow-hidden rounded-2xl p-5 text-left shadow-sm transition-transform enabled:hover:-translate-y-0.5 sm:w-[320px]"
          style={{
            backgroundColor: offer.backgroundColor,
            color: offer.textColor,
          }}
        >
          {offer.imageUrl && (
            <img
              src={offer.imageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-25"
            />
          )}
          <div className="absolute top-3 right-3">
            {offer.badgeText && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                <Sparkles className="h-2.5 w-2.5" />
                {offer.badgeText}
              </span>
            )}
          </div>
          <div className="relative">
            <div className="mb-3 text-4xl">🏷️</div>
            <h3 className="text-lg font-black leading-tight">{offer.title}</h3>
            {offer.subtitle && (
              <p className="mt-1 text-sm font-semibold opacity-80">
                {offer.subtitle}
              </p>
            )}
            {offer.targetUrl && (
              <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-black transition-colors group-hover:bg-white/30">
                {offer.ctaLabel}
                <ArrowRight className="h-3 w-3" />
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import type { PromotionCampaign } from "@/components/customer/promotion-types";
import { apiClient } from "@aagam/utils";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  Clock3,
  Copy,
  Gift,
  Loader2,
  Tag,
  Truck,
} from "lucide-react";

type Coupon = {
  id: string;
  code?: string | null;
  name: string;
  description?: string | null;
  applicationMode: "CODE" | "AUTO";
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_DELIVERY";
  percentageBps?: number | null;
  amountPaise?: number | null;
  maxDiscountPaise?: number | null;
  minimumSubtotalPaise: number;
  firstOrderOnly: boolean;
  eligibilityScope: string;
  startsAt?: string | null;
  endsAt?: string | null;
  store?: { id: string; name: string } | null;
  eligible: boolean;
  ineligibleReason?: string | null;
};

const couponLabel = (coupon: Coupon) => {
  if (coupon.discountType === "FREE_DELIVERY") return "Free delivery";
  if (coupon.discountType === "FIXED_AMOUNT")
    return `₹${Math.round(Number(coupon.amountPaise || 0) / 100)} off`;
  return `${Number(coupon.percentageBps || 0) / 100}% off`;
};

const endsLabel = (endsAt?: string | null) => {
  if (!endsAt) return "No fixed end date";
  const remaining = new Date(endsAt).getTime() - Date.now();
  if (remaining <= 0) return "Expired";
  const hours = Math.ceil(remaining / 3_600_000);
  return hours < 48
    ? `Ends in ${hours}h`
    : `Ends ${new Date(endsAt).toLocaleDateString()}`;
};

export default function DealsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    apiClient
      .get("/promotions/deals")
      .then((response) => {
        setCampaigns(
          Array.isArray(response.data?.campaigns) ? response.data.campaigns : []
        );
        setCoupons(
          Array.isArray(response.data?.coupons) ? response.data.coupons : []
        );
      })
      .catch((requestError) =>
        setError(
          requestError?.response?.data?.message ||
            "Could not load current deals."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const copyCode = async (coupon: Coupon) => {
    if (!coupon.code) return;
    await navigator.clipboard.writeText(coupon.code);
    setCopied(coupon.id);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const useCoupon = (coupon: Coupon) => {
    if (!coupon.eligible) return;
    if (coupon.code) sessionStorage.setItem("aagam_coupon_code", coupon.code);
    router.push(
      coupon.code
        ? `/shop/checkout?coupon=${encodeURIComponent(coupon.code)}`
        : "/shop/checkout"
    );
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-6xl pb-10">
        <div className="mb-6 flex items-center gap-3">
          <button
            aria-label="Back to shop"
            onClick={() => router.push("/shop")}
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-950">
              Deals & Offers
            </h1>
            <p className="text-xs font-semibold text-slate-500">
              Live campaigns and account-eligible coupons
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-64 place-items-center rounded-3xl border border-slate-100 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : (
          <div className="space-y-8">
            {campaigns.length > 0 && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Gift className="h-4 w-4 text-teal-700" />
                  <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">
                    Featured campaigns
                  </h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {campaigns.map((campaign) => (
                    <button
                      type="button"
                      key={campaign.id}
                      onClick={() =>
                        campaign.targetUrl && router.push(campaign.targetUrl)
                      }
                      disabled={!campaign.targetUrl}
                      className="group relative min-h-52 overflow-hidden rounded-3xl p-6 text-left shadow-sm transition-transform enabled:hover:-translate-y-0.5"
                      style={{
                        backgroundColor: campaign.backgroundColor,
                        color: campaign.textColor,
                      }}
                    >
                      {campaign.imageUrl && (
                        <img
                          src={campaign.imageUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover opacity-30"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-r from-black/50 to-transparent" />
                      <div className="relative">
                        {campaign.badgeText && (
                          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider">
                            {campaign.badgeText}
                          </span>
                        )}
                        <h3 className="mt-5 text-2xl font-black">
                          {campaign.title}
                        </h3>
                        {campaign.subtitle && (
                          <p className="mt-2 text-sm font-bold opacity-85">
                            {campaign.subtitle}
                          </p>
                        )}
                        {campaign.targetUrl && (
                          <span
                            className="mt-5 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black text-slate-950"
                            style={{ backgroundColor: campaign.accentColor }}
                          >
                            {campaign.ctaLabel}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Tag className="h-4 w-4 text-teal-700" />
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">
                  Available coupons
                </h2>
              </div>
              {coupons.length === 0 ? (
                <div
                  data-testid="deals-empty"
                  className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center"
                >
                  <BadgePercent className="mx-auto h-7 w-7 text-slate-400" />
                  <h3 className="mt-3 font-black text-slate-900">
                    No coupons are active
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Only currently published, server-validated offers appear
                    here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {coupons.map((coupon) => {
                    const Icon =
                      coupon.discountType === "FREE_DELIVERY"
                        ? Truck
                        : coupon.discountType === "PERCENTAGE"
                        ? BadgePercent
                        : Gift;
                    return (
                      <article
                        key={coupon.id}
                        className={`overflow-hidden rounded-2xl border bg-white transition-shadow hover:shadow-md ${
                          coupon.eligible
                            ? "border-slate-100"
                            : "border-slate-200 opacity-70"
                        }`}
                      >
                        <div className="h-1.5 bg-gradient-to-r from-teal-500 via-emerald-500 to-amber-400" />
                        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                              <Icon className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-base font-black text-slate-950">
                                  {couponLabel(coupon)} · {coupon.name}
                                </h3>
                                {coupon.applicationMode === "AUTO" && (
                                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">
                                    Automatic
                                  </span>
                                )}
                              </div>
                              {coupon.description && (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {coupon.description}
                                </p>
                              )}
                              <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
                                <span className="rounded-lg bg-slate-100 px-2 py-1">
                                  Min ₹
                                  {(coupon.minimumSubtotalPaise / 100).toFixed(
                                    0
                                  )}
                                </span>
                                {coupon.firstOrderOnly && (
                                  <span className="rounded-lg bg-slate-100 px-2 py-1">
                                    First order
                                  </span>
                                )}
                                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
                                  <Clock3 className="h-3 w-3" />
                                  {endsLabel(coupon.endsAt)}
                                </span>
                                {coupon.store && (
                                  <span className="rounded-lg bg-slate-100 px-2 py-1">
                                    {coupon.store.name}
                                  </span>
                                )}
                              </div>
                              {!coupon.eligible && (
                                <p className="mt-2 text-xs font-black text-red-600">
                                  {coupon.ineligibleReason}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {coupon.code && (
                              <button
                                onClick={() => copyCode(coupon)}
                                className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-left"
                              >
                                <span className="block text-[9px] font-black uppercase text-slate-400">
                                  {copied === coupon.id
                                    ? "Copied"
                                    : "Coupon code"}
                                </span>
                                <span className="inline-flex items-center gap-1.5 font-mono text-sm font-black text-slate-950">
                                  {coupon.code}
                                  {copied === coupon.id ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </span>
                              </button>
                            )}
                            <button
                              disabled={!coupon.eligible}
                              onClick={() => useCoupon(coupon)}
                              className="rounded-xl bg-slate-950 px-4 py-3 text-xs font-black text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {coupon.applicationMode === "AUTO"
                                ? "Shop now"
                                : "Use offer"}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

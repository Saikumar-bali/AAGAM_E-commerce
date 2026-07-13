"use client";

import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  Archive,
  BadgePercent,
  CalendarClock,
  Edit3,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

type Named = { id: string; name: string };
type Campaign = {
  id: string;
  internalName: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badgeText?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  ctaLabel: string;
  targetType: string;
  targetPath?: string | null;
  productId?: string | null;
  categoryId?: string | null;
  couponId?: string | null;
  status: string;
  effectiveStatus: string;
  startsAt?: string | null;
  endsAt?: string | null;
  priority: number;
  firstOrderOnly: boolean;
  placements: Array<{ placement: string }>;
};
type Coupon = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  effectiveStatus: string;
  applicationMode: string;
  discountType: string;
  percentageBps?: number | null;
  amountPaise?: number | null;
  maxDiscountPaise?: number | null;
  minimumSubtotalPaise: number;
  startsAt?: string | null;
  endsAt?: string | null;
  totalUsageLimit?: number | null;
  perCustomerLimit: number;
  firstOrderOnly: boolean;
  eligibilityScope: string;
  priority: number;
  storeId?: string | null;
  productEligibilities: Array<{ productId: string }>;
  categoryEligibilities: Array<{ categoryId: string }>;
  store?: Named | null;
  _count?: { redemptions: number; campaigns: number };
};
type CampaignForm = {
  internalName: string;
  title: string;
  subtitle: string;
  description: string;
  badgeText: string;
  imageUrl: string;
  mobileImageUrl: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  ctaLabel: string;
  targetType: string;
  targetPath: string;
  productId: string;
  categoryId: string;
  couponId: string;
  status: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  firstOrderOnly: boolean;
  placements: string[];
};
type CouponForm = {
  code: string;
  name: string;
  description: string;
  status: string;
  applicationMode: string;
  discountType: string;
  percentage: string;
  amount: string;
  maxDiscount: string;
  minimumSubtotal: string;
  startsAt: string;
  endsAt: string;
  totalUsageLimit: string;
  perCustomerLimit: string;
  firstOrderOnly: boolean;
  eligibilityScope: string;
  priority: string;
  storeId: string;
  eligibleProductIds: string[];
  eligibleCategoryIds: string[];
};

const placements = ["HOME_HERO", "HOME_TODAY_OFFERS", "DEALS_PAGE"];
const campaignDefaults = (): CampaignForm => ({
  internalName: "",
  title: "",
  subtitle: "",
  description: "",
  badgeText: "",
  imageUrl: "",
  mobileImageUrl: "",
  backgroundColor: "#0f172a",
  textColor: "#ffffff",
  accentColor: "#2dd4bf",
  ctaLabel: "Shop now",
  targetType: "DEALS",
  targetPath: "",
  productId: "",
  categoryId: "",
  couponId: "",
  status: "DRAFT",
  startsAt: "",
  endsAt: "",
  priority: "0",
  firstOrderOnly: false,
  placements: ["HOME_TODAY_OFFERS"],
});
const couponDefaults = (): CouponForm => ({
  code: "",
  name: "",
  description: "",
  status: "DRAFT",
  applicationMode: "CODE",
  discountType: "PERCENTAGE",
  percentage: "10",
  amount: "",
  maxDiscount: "",
  minimumSubtotal: "0",
  startsAt: "",
  endsAt: "",
  totalUsageLimit: "",
  perCustomerLimit: "1",
  firstOrderOnly: false,
  eligibilityScope: "ALL",
  priority: "0",
  storeId: "",
  eligibleProductIds: [],
  eligibleCategoryIds: [],
});
const localDate = (value?: string | null) =>
  value
    ? new Date(
        new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000
      )
        .toISOString()
        .slice(0, 16)
    : "";
const isoDate = (value: string) =>
  value ? new Date(value).toISOString() : null;
const moneyToPaise = (value: string) =>
  value === "" ? null : Math.round(Number(value) * 100);
const statusStyle = (status: string) =>
  status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-700"
    : status === "SCHEDULED"
    ? "bg-blue-50 text-blue-700"
    : status === "PAUSED"
    ? "bg-amber-50 text-amber-700"
    : status === "EXPIRED" || status === "ARCHIVED"
    ? "bg-slate-100 text-slate-500"
    : "bg-violet-50 text-violet-700";

export default function AdminPromotionsPage() {
  const [tab, setTab] = useState<"campaigns" | "coupons">("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Named[]>([]);
  const [categories, setCategories] = useState<Named[]>([]);
  const [stores, setStores] = useState<Named[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [couponDialog, setCouponDialog] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(
    null
  );
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignForm>(
    campaignDefaults()
  );
  const [couponForm, setCouponForm] = useState<CouponForm>(couponDefaults());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignRes, couponRes, productRes, categoryRes, storeRes] =
        await Promise.all([
          apiClient.get("/admin/promotions/campaigns"),
          apiClient.get("/admin/promotions/coupons"),
          apiClient.get("/admin/products"),
          apiClient.get("/products/categories"),
          apiClient.get("/stores"),
        ]);
      setCampaigns(Array.isArray(campaignRes.data) ? campaignRes.data : []);
      setCoupons(Array.isArray(couponRes.data) ? couponRes.data : []);
      setProducts(
        (Array.isArray(productRes.data) ? productRes.data : []).map(
          (item: any) => ({ id: item.id, name: item.name })
        )
      );
      setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : []);
      setStores(Array.isArray(storeRes.data) ? storeRes.data : []);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          "Failed to load promotion control data."
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const liveCampaigns = useMemo(
    () => campaigns.filter((item) => item.effectiveStatus === "ACTIVE").length,
    [campaigns]
  );
  const liveCoupons = useMemo(
    () => coupons.filter((item) => item.effectiveStatus === "ACTIVE").length,
    [coupons]
  );
  const openCampaign = (campaign?: Campaign) => {
    setError("");
    setEditingCampaignId(campaign?.id || null);
    setCampaignForm(
      campaign
        ? {
            internalName: campaign.internalName,
            title: campaign.title,
            subtitle: campaign.subtitle || "",
            description: campaign.description || "",
            badgeText: campaign.badgeText || "",
            imageUrl: campaign.imageUrl || "",
            mobileImageUrl: campaign.mobileImageUrl || "",
            backgroundColor: campaign.backgroundColor,
            textColor: campaign.textColor,
            accentColor: campaign.accentColor,
            ctaLabel: campaign.ctaLabel,
            targetType: campaign.targetType,
            targetPath: campaign.targetPath || "",
            productId: campaign.productId || "",
            categoryId: campaign.categoryId || "",
            couponId: campaign.couponId || "",
            status: campaign.status,
            startsAt: localDate(campaign.startsAt),
            endsAt: localDate(campaign.endsAt),
            priority: String(campaign.priority),
            firstOrderOnly: campaign.firstOrderOnly,
            placements: campaign.placements.map((item) => item.placement),
          }
        : campaignDefaults()
    );
    setCampaignDialog(true);
  };
  const openCoupon = (coupon?: Coupon) => {
    setError("");
    setEditingCouponId(coupon?.id || null);
    setCouponForm(
      coupon
        ? {
            code: coupon.code,
            name: coupon.name,
            description: coupon.description || "",
            status: coupon.status,
            applicationMode: coupon.applicationMode,
            discountType: coupon.discountType,
            percentage: coupon.percentageBps
              ? String(coupon.percentageBps / 100)
              : "",
            amount: coupon.amountPaise ? String(coupon.amountPaise / 100) : "",
            maxDiscount: coupon.maxDiscountPaise
              ? String(coupon.maxDiscountPaise / 100)
              : "",
            minimumSubtotal: String(coupon.minimumSubtotalPaise / 100),
            startsAt: localDate(coupon.startsAt),
            endsAt: localDate(coupon.endsAt),
            totalUsageLimit: coupon.totalUsageLimit
              ? String(coupon.totalUsageLimit)
              : "",
            perCustomerLimit: String(coupon.perCustomerLimit),
            firstOrderOnly: coupon.firstOrderOnly,
            eligibilityScope: coupon.eligibilityScope,
            priority: String(coupon.priority),
            storeId: coupon.storeId || "",
            eligibleProductIds: coupon.productEligibilities.map(
              (item) => item.productId
            ),
            eligibleCategoryIds: coupon.categoryEligibilities.map(
              (item) => item.categoryId
            ),
          }
        : couponDefaults()
    );
    setCouponDialog(true);
  };

  const uploadCampaignImage = async (
    event: React.ChangeEvent<HTMLInputElement>,
    mobile = false
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type
      ) ||
      file.size > 5 * 1024 * 1024
    )
      return setError(
        "Campaign images must be JPEG, PNG, WebP, or GIF under 5MB."
      );
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await apiClient.post("/upload/promotion-image", body);
      setCampaignForm((current) => ({
        ...current,
        [mobile ? "mobileImageUrl" : "imageUrl"]: response.data.publicUrl,
      }));
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message || "Campaign image upload failed."
      );
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (!campaignForm.placements.length)
        throw new globalThis.Error("Select at least one placement.");
      const payload = {
        ...campaignForm,
        internalName: campaignForm.internalName.trim(),
        title: campaignForm.title.trim(),
        subtitle: campaignForm.subtitle.trim(),
        description: campaignForm.description.trim(),
        badgeText: campaignForm.badgeText.trim(),
        imageUrl: campaignForm.imageUrl || null,
        mobileImageUrl: campaignForm.mobileImageUrl || null,
        targetPath: campaignForm.targetPath || null,
        productId: campaignForm.productId || null,
        categoryId: campaignForm.categoryId || null,
        couponId: campaignForm.couponId || null,
        startsAt: isoDate(campaignForm.startsAt),
        endsAt: isoDate(campaignForm.endsAt),
        priority: Number(campaignForm.priority || 0),
      };
      if (editingCampaignId)
        await apiClient.patch(
          `/admin/promotions/campaigns/${editingCampaignId}`,
          payload
        );
      else await apiClient.post("/admin/promotions/campaigns", payload);
      setCampaignDialog(false);
      setMessage(editingCampaignId ? "Campaign updated." : "Campaign created.");
      await load();
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Campaign could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const saveCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        code: couponForm.code.trim().toUpperCase(),
        name: couponForm.name.trim(),
        description: couponForm.description.trim(),
        status: couponForm.status,
        applicationMode: couponForm.applicationMode,
        discountType: couponForm.discountType,
        percentageBps:
          couponForm.discountType === "PERCENTAGE"
            ? Math.round(Number(couponForm.percentage) * 100)
            : null,
        amountPaise:
          couponForm.discountType === "FIXED_AMOUNT"
            ? moneyToPaise(couponForm.amount)
            : null,
        maxDiscountPaise:
          couponForm.discountType === "PERCENTAGE"
            ? moneyToPaise(couponForm.maxDiscount)
            : null,
        minimumSubtotalPaise: moneyToPaise(couponForm.minimumSubtotal) || 0,
        startsAt: isoDate(couponForm.startsAt),
        endsAt: isoDate(couponForm.endsAt),
        totalUsageLimit: couponForm.totalUsageLimit
          ? Number(couponForm.totalUsageLimit)
          : null,
        perCustomerLimit: Number(couponForm.perCustomerLimit || 1),
        firstOrderOnly: couponForm.firstOrderOnly,
        eligibilityScope: couponForm.eligibilityScope,
        priority: Number(couponForm.priority || 0),
        storeId: couponForm.storeId || null,
        eligibleProductIds:
          couponForm.eligibilityScope === "PRODUCTS"
            ? couponForm.eligibleProductIds
            : [],
        eligibleCategoryIds:
          couponForm.eligibilityScope === "CATEGORIES"
            ? couponForm.eligibleCategoryIds
            : [],
      };
      if (editingCouponId)
        await apiClient.patch(
          `/admin/promotions/coupons/${editingCouponId}`,
          payload
        );
      else await apiClient.post("/admin/promotions/coupons", payload);
      setCouponDialog(false);
      setMessage(editingCouponId ? "Coupon updated." : "Coupon created.");
      await load();
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Coupon could not be saved."
      );
    } finally {
      setSaving(false);
    }
  };

  const setCampaignStatus = async (campaign: Campaign, status: string) => {
    setError("");
    try {
      await apiClient.patch(`/admin/promotions/campaigns/${campaign.id}`, {
        status,
      });
      await load();
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message || "Status update failed."
      );
    }
  };
  const setCouponStatus = async (coupon: Coupon, status: string) => {
    setError("");
    try {
      await apiClient.patch(`/admin/promotions/coupons/${coupon.id}`, {
        status,
      });
      await load();
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message || "Status update failed."
      );
    }
  };
  const archive = async (kind: "campaigns" | "coupons", id: string) => {
    if (
      !window.confirm("Archive this item? It will stop appearing to customers.")
    )
      return;
    try {
      await apiClient.delete(`/admin/promotions/${kind}/${id}`);
      await load();
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "Archive failed.");
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6 pb-12">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">
              Growth operations
            </p>
            <h1 className="mt-3 text-3xl font-black text-slate-950">
              Promotions & Coupons
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
              Control customer slides, Today&apos;s Offers, Deals, coupon
              pricing, eligibility, schedules, usage limits, and click
              destinations from one audited source.
            </p>
          </div>
          <button
            onClick={() =>
              tab === "campaigns" ? openCampaign() : openCoupon()
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" />
            New {tab === "campaigns" ? "campaign" : "coupon"}
          </button>
        </header>
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: "Campaigns", value: campaigns.length, icon: Megaphone },
            { label: "Live campaigns", value: liveCampaigns, icon: Play },
            { label: "Coupons", value: coupons.length, icon: BadgePercent },
            { label: "Live coupons", value: liveCoupons, icon: CalendarClock },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    {item.label}
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-950">
                    {item.value}
                  </p>
                </div>
                <item.icon className="h-5 w-5 text-teal-600" />
              </div>
            </div>
          ))}
        </div>
        {(error || message) && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-bold ${
              error
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {error || message}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2">
          <button
            onClick={() => setTab("campaigns")}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black ${
              tab === "campaigns"
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Campaign placements
          </button>
          <button
            onClick={() => setTab("coupons")}
            className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-black ${
              tab === "coupons"
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            Pricing coupons
          </button>
          <button
            aria-label="Refresh"
            onClick={load}
            className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {loading ? (
          <div className="grid min-h-64 place-items-center rounded-3xl border border-slate-100 bg-white">
            <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
          </div>
        ) : tab === "campaigns" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {campaigns.length === 0 ? (
              <Empty text="No campaigns yet. Create one in Draft, preview its targeting, then publish it." />
            ) : (
              campaigns.map((campaign) => (
                <article
                  key={campaign.id}
                  className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"
                >
                  <div
                    className="relative min-h-44 p-5"
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
                    <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(
                            campaign.effectiveStatus
                          )}`}
                        >
                          {campaign.effectiveStatus}
                        </span>
                        <span className="rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-black">
                          Priority {campaign.priority}
                        </span>
                      </div>
                      <p className="mt-7 text-xs font-black uppercase tracking-widest opacity-70">
                        {campaign.internalName}
                      </p>
                      <h3 className="mt-1 text-2xl font-black">
                        {campaign.title}
                      </h3>
                      <p className="mt-1 text-sm font-bold opacity-80">
                        {campaign.subtitle}
                      </p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex flex-wrap gap-1.5">
                      {campaign.placements.map((item) => (
                        <span
                          key={item.placement}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600"
                        >
                          {item.placement.replaceAll("_", " ")}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs font-bold text-slate-500">
                      Target: {campaign.targetType}
                      {campaign.firstOrderOnly ? " · First order only" : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                      {campaign.startsAt
                        ? new Date(campaign.startsAt).toLocaleString()
                        : "Starts immediately"}{" "}
                      →{" "}
                      {campaign.endsAt
                        ? new Date(campaign.endsAt).toLocaleString()
                        : "No end date"}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => openCampaign(campaign)}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {campaign.status === "ACTIVE" ||
                      campaign.status === "SCHEDULED" ? (
                        <button
                          onClick={() => setCampaignStatus(campaign, "PAUSED")}
                          className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700"
                          title="Pause"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            setCampaignStatus(
                              campaign,
                              campaign.startsAt &&
                                new Date(campaign.startsAt) > new Date()
                                ? "SCHEDULED"
                                : "ACTIVE"
                            )
                          }
                          className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"
                          title="Publish"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => archive("campaigns", campaign.id)}
                        className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
                        title="Archive"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-4">Coupon</th>
                    <th className="px-5 py-4">Rule</th>
                    <th className="px-5 py-4">Eligibility</th>
                    <th className="px-5 py-4">Usage</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coupons.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <Empty text="No pricing coupons yet. Create a code or automatic offer." />
                      </td>
                    </tr>
                  ) : (
                    coupons.map((coupon) => (
                      <tr key={coupon.id}>
                        <td className="px-5 py-4">
                          <p className="font-mono text-sm font-black text-slate-950">
                            {coupon.code}
                          </p>
                          <p className="text-xs font-bold text-slate-500">
                            {coupon.name} · {coupon.applicationMode}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-sm font-black text-slate-800">
                          {coupon.discountType === "PERCENTAGE"
                            ? `${Number(coupon.percentageBps || 0) / 100}%`
                            : coupon.discountType === "FIXED_AMOUNT"
                            ? `₹${Number(coupon.amountPaise || 0) / 100}`
                            : "Free delivery"}
                          <p className="text-[11px] font-semibold text-slate-400">
                            Min ₹{coupon.minimumSubtotalPaise / 100}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-slate-600">
                          {coupon.eligibilityScope}
                          {coupon.store ? ` · ${coupon.store.name}` : ""}
                          {coupon.firstOrderOnly ? " · First order" : ""}
                        </td>
                        <td className="px-5 py-4 text-xs font-bold text-slate-600">
                          {coupon._count?.redemptions || 0}
                          {coupon.totalUsageLimit
                            ? ` / ${coupon.totalUsageLimit}`
                            : ""}
                          <p className="text-[11px] font-semibold text-slate-400">
                            {coupon.perCustomerLimit}/customer
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${statusStyle(
                              coupon.effectiveStatus
                            )}`}
                          >
                            {coupon.effectiveStatus}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => openCoupon(coupon)}
                              className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-600"
                            >
                              <Edit3 className="h-4 w-4" />
                            </button>
                            {coupon.status === "ACTIVE" ||
                            coupon.status === "SCHEDULED" ? (
                              <button
                                onClick={() =>
                                  setCouponStatus(coupon, "PAUSED")
                                }
                                className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700"
                              >
                                <Pause className="h-4 w-4" />
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setCouponStatus(
                                    coupon,
                                    coupon.startsAt &&
                                      new Date(coupon.startsAt) > new Date()
                                      ? "SCHEDULED"
                                      : "ACTIVE"
                                  )
                                }
                                className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700"
                              >
                                <Play className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={() => archive("coupons", coupon.id)}
                              className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {campaignDialog && (
        <Modal
          title={editingCampaignId ? "Edit campaign" : "Create campaign"}
          subtitle="One campaign can be assigned to multiple customer placements."
          onClose={() => setCampaignDialog(false)}
        >
          <form onSubmit={saveCampaign} className="space-y-5">
            <Error text={error} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Internal name">
                <input
                  required
                  value={campaignForm.internalName}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      internalName: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Customer title">
                <input
                  required
                  value={campaignForm.title}
                  onChange={(e) =>
                    setCampaignForm({ ...campaignForm, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Subtitle">
                <input
                  value={campaignForm.subtitle}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      subtitle: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Badge">
                <input
                  value={campaignForm.badgeText}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      badgeText: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  rows={3}
                  value={campaignForm.description}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
            </div>
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-950">
                Placement & destination
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {placements.map((placement) => (
                  <label
                    key={placement}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-black ${
                      campaignForm.placements.includes(placement)
                        ? "border-teal-400 bg-teal-50 text-teal-800"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={campaignForm.placements.includes(placement)}
                      onChange={() =>
                        setCampaignForm((current) => ({
                          ...current,
                          placements: current.placements.includes(placement)
                            ? current.placements.filter(
                                (item) => item !== placement
                              )
                            : [...current.placements, placement],
                        }))
                      }
                    />
                    {placement.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Field label="Click destination">
                  <select
                    value={campaignForm.targetType}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        targetType: e.target.value,
                      })
                    }
                  >
                    <option value="DEALS">Deals page</option>
                    <option value="PRODUCT">Product</option>
                    <option value="CATEGORY">Category</option>
                    <option value="INTERNAL_PATH">Internal shop path</option>
                    <option value="NONE">No click action</option>
                  </select>
                </Field>
                {campaignForm.targetType === "PRODUCT" && (
                  <Field label="Product">
                    <select
                      required
                      value={campaignForm.productId}
                      onChange={(e) =>
                        setCampaignForm({
                          ...campaignForm,
                          productId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select product</option>
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {campaignForm.targetType === "CATEGORY" && (
                  <Field label="Category">
                    <select
                      required
                      value={campaignForm.categoryId}
                      onChange={(e) =>
                        setCampaignForm({
                          ...campaignForm,
                          categoryId: e.target.value,
                        })
                      }
                    >
                      <option value="">Select category</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {campaignForm.targetType === "INTERNAL_PATH" && (
                  <Field label="Internal path">
                    <input
                      required
                      placeholder="/shop/wishlist"
                      value={campaignForm.targetPath}
                      onChange={(e) =>
                        setCampaignForm({
                          ...campaignForm,
                          targetPath: e.target.value,
                        })
                      }
                    />
                  </Field>
                )}
                <Field label="Linked coupon">
                  <select
                    value={campaignForm.couponId}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        couponId: e.target.value,
                      })
                    }
                  >
                    <option value="">None</option>
                    {coupons
                      .filter((item) => item.status !== "ARCHIVED")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.code} · {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="CTA label">
                  <input
                    value={campaignForm.ctaLabel}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        ctaLabel: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-950">Creative</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <UploadField
                  label="Desktop / default image"
                  url={campaignForm.imageUrl}
                  uploading={uploading}
                  onUpload={(event) => uploadCampaignImage(event)}
                  onClear={() =>
                    setCampaignForm({ ...campaignForm, imageUrl: "" })
                  }
                />
                <UploadField
                  label="Optional mobile image"
                  url={campaignForm.mobileImageUrl}
                  uploading={uploading}
                  onUpload={(event) => uploadCampaignImage(event, true)}
                  onClear={() =>
                    setCampaignForm({ ...campaignForm, mobileImageUrl: "" })
                  }
                />
                <Field label="Background">
                  <input
                    type="color"
                    value={campaignForm.backgroundColor}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        backgroundColor: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Text">
                  <input
                    type="color"
                    value={campaignForm.textColor}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        textColor: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="CTA accent">
                  <input
                    type="color"
                    value={campaignForm.accentColor}
                    onChange={(e) =>
                      setCampaignForm({
                        ...campaignForm,
                        accentColor: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            </section>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Status">
                <select
                  value={campaignForm.status}
                  onChange={(e) =>
                    setCampaignForm({ ...campaignForm, status: e.target.value })
                  }
                >
                  <option>DRAFT</option>
                  <option>SCHEDULED</option>
                  <option>ACTIVE</option>
                  <option>PAUSED</option>
                </select>
              </Field>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={campaignForm.startsAt}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      startsAt: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  value={campaignForm.endsAt}
                  onChange={(e) =>
                    setCampaignForm({ ...campaignForm, endsAt: e.target.value })
                  }
                />
              </Field>
              <Field label="Priority">
                <input
                  type="number"
                  min="-1000"
                  max="1000"
                  value={campaignForm.priority}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      priority: e.target.value,
                    })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={campaignForm.firstOrderOnly}
                  onChange={(e) =>
                    setCampaignForm({
                      ...campaignForm,
                      firstOrderOnly: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-teal-600"
                />
                First-order customers only
              </label>
            </div>
            <Submit
              saving={saving}
              label={editingCampaignId ? "Save campaign" : "Create campaign"}
            />
          </form>
        </Modal>
      )}
      {couponDialog && (
        <Modal
          title={editingCouponId ? "Edit coupon" : "Create coupon"}
          subtitle="All amounts are stored and calculated in paise on the server."
          onClose={() => setCouponDialog(false)}
        >
          <form onSubmit={saveCoupon} className="space-y-5">
            <Error text={error} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Code / internal key">
                <input
                  required
                  pattern="[A-Z0-9_-]{3,32}"
                  value={couponForm.code}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field label="Customer name">
                <input
                  required
                  value={couponForm.name}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  rows={3}
                  value={couponForm.description}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Application">
                <select
                  value={couponForm.applicationMode}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      applicationMode: e.target.value,
                    })
                  }
                >
                  <option value="CODE">Customer enters code</option>
                  <option value="AUTO">Apply automatically</option>
                </select>
              </Field>
              <Field label="Discount">
                <select
                  value={couponForm.discountType}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      discountType: e.target.value,
                    })
                  }
                >
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED_AMOUNT">Fixed amount</option>
                  <option value="FREE_DELIVERY">Free delivery</option>
                </select>
              </Field>
              {couponForm.discountType === "PERCENTAGE" && (
                <>
                  <Field label="Percentage">
                    <input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      required
                      value={couponForm.percentage}
                      onChange={(e) =>
                        setCouponForm({
                          ...couponForm,
                          percentage: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Maximum discount ₹">
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={couponForm.maxDiscount}
                      onChange={(e) =>
                        setCouponForm({
                          ...couponForm,
                          maxDiscount: e.target.value,
                        })
                      }
                    />
                  </Field>
                </>
              )}
              {couponForm.discountType === "FIXED_AMOUNT" && (
                <Field label="Discount amount ₹">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={couponForm.amount}
                    onChange={(e) =>
                      setCouponForm({ ...couponForm, amount: e.target.value })
                    }
                  />
                </Field>
              )}
              <Field label="Minimum cart ₹">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={couponForm.minimumSubtotal}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      minimumSubtotal: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Store restriction">
                <select
                  value={couponForm.storeId}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, storeId: e.target.value })
                  }
                >
                  <option value="">All stores</option>
                  {stores.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <section className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-sm font-black text-slate-950">
                Eligible cart lines
              </h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="Scope">
                  <select
                    value={couponForm.eligibilityScope}
                    onChange={(e) =>
                      setCouponForm({
                        ...couponForm,
                        eligibilityScope: e.target.value,
                      })
                    }
                  >
                    <option value="ALL">All products</option>
                    <option value="PRODUCTS">Selected products</option>
                    <option value="CATEGORIES">Selected categories</option>
                  </select>
                </Field>
                {couponForm.eligibilityScope === "PRODUCTS" && (
                  <Field label="Products">
                    <select
                      multiple
                      required
                      value={couponForm.eligibleProductIds}
                      onChange={(e) =>
                        setCouponForm({
                          ...couponForm,
                          eligibleProductIds: Array.from(
                            e.target.selectedOptions
                          ).map((option) => option.value),
                        })
                      }
                      className="min-h-36"
                    >
                      {products.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {couponForm.eligibilityScope === "CATEGORIES" && (
                  <Field label="Categories">
                    <select
                      multiple
                      required
                      value={couponForm.eligibleCategoryIds}
                      onChange={(e) =>
                        setCouponForm({
                          ...couponForm,
                          eligibleCategoryIds: Array.from(
                            e.target.selectedOptions
                          ).map((option) => option.value),
                        })
                      }
                      className="min-h-32"
                    >
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>
            </section>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Status">
                <select
                  value={couponForm.status}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, status: e.target.value })
                  }
                >
                  <option>DRAFT</option>
                  <option>SCHEDULED</option>
                  <option>ACTIVE</option>
                  <option>PAUSED</option>
                </select>
              </Field>
              <Field label="Starts">
                <input
                  type="datetime-local"
                  value={couponForm.startsAt}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, startsAt: e.target.value })
                  }
                />
              </Field>
              <Field label="Ends">
                <input
                  type="datetime-local"
                  value={couponForm.endsAt}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, endsAt: e.target.value })
                  }
                />
              </Field>
              <Field label="Total uses">
                <input
                  type="number"
                  min="1"
                  placeholder="Unlimited"
                  value={couponForm.totalUsageLimit}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      totalUsageLimit: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Per customer">
                <input
                  type="number"
                  min="1"
                  required
                  value={couponForm.perCustomerLimit}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      perCustomerLimit: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Auto priority">
                <input
                  type="number"
                  min="-1000"
                  max="1000"
                  value={couponForm.priority}
                  onChange={(e) =>
                    setCouponForm({ ...couponForm, priority: e.target.value })
                  }
                />
              </Field>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={couponForm.firstOrderOnly}
                  onChange={(e) =>
                    setCouponForm({
                      ...couponForm,
                      firstOrderOnly: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-teal-600"
                />
                First order only
              </label>
            </div>
            <Submit
              saving={saving}
              label={editingCouponId ? "Save coupon" : "Create coupon"}
            />
          </form>
        </Modal>
      )}
    </DashboardLayout>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Megaphone className="mx-auto h-7 w-7 text-slate-400" />
      <p className="mt-3 text-sm font-bold text-slate-500">{text}</p>
    </div>
  );
}
function Error({ text }: { text: string }) {
  return text ? (
    <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
      {text}
    </div>
  ) : null;
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactElement<any>;
}) {
  return (
    <label
      className={`block text-xs font-black uppercase tracking-wide text-slate-500 ${
        wide ? "md:col-span-2" : ""
      }`}
    >
      {label}
      {React.cloneElement(children, {
        className: `${
          children.props.className || ""
        } mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-950 focus:border-teal-500 focus:outline-none`,
      })}
    </label>
  );
}
function UploadField({
  label,
  url,
  uploading,
  onUpload,
  onClear,
}: {
  label: string;
  url: string;
  uploading: boolean;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex min-h-28 items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 p-3">
        {url ? (
          <img
            src={url}
            alt="Campaign preview"
            className="h-20 w-28 rounded-xl object-cover"
          />
        ) : (
          <ImageIcon className="h-7 w-7 text-slate-300" />
        )}
        <div>
          <input
            id={`image-${label}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onUpload}
            disabled={uploading}
            className="hidden"
          />
          <label
            htmlFor={`image-${label}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Upload
          </label>
          {url && (
            <button
              type="button"
              onClick={onClear}
              className="ml-2 text-xs font-black text-red-600"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
function Submit({ saving, label }: { saving: boolean; label: string }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 border-t border-slate-100 bg-white p-5">
      <button
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

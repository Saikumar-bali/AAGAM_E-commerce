"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Store,
  Package,
  Truck,
  ShoppingCart,
  LogOut,
  User,
  MapPin,
  Heart,
  Tag,
  RotateCcw,
  UserCircle,
  Radar,
  BarChart3,
  Headphones,
  Bell,
  Bike,
  ShieldAlert,
  Megaphone,
  ClipboardCheck,
  MapPinned,
  Menu,
  X,
} from "lucide-react";

import { apiClient } from "@aagam/utils";
import AagamLogo from "./AagamLogo";

interface SidebarProps {
  role: "ADMIN" | "RIDER" | "CUSTOMER" | "STORE_OWNER";
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = React.useState<{
    name: string;
    email: string;
    avatarUrl: string;
  }>({ name: "", email: "", avatarUrl: "" });
  const [riderUnread, setRiderUnread] = React.useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || role !== "CUSTOMER") return;
    setProfile({
      name: localStorage.getItem("user_name") || "",
      email: localStorage.getItem("user_email") || "",
      avatarUrl: localStorage.getItem("user_avatar") || "",
    });
  }, [role]);

  React.useEffect(() => {
    if (role !== "RIDER") return;
    let active = true;
    const refresh = () =>
      apiClient
        .get("/notifications/inbox?limit=1")
        .then((response) => {
          if (active) setRiderUnread(Number(response.data?.unreadCount || 0));
        })
        .catch(() => undefined);
    void refresh();
    window.addEventListener("aagam:push-message", refresh);
    return () => {
      active = false;
      window.removeEventListener("aagam:push-message", refresh);
    };
  }, [role]);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  const initials = (profile.name || profile.email || "A")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    try {
      const subscriptionId = localStorage.getItem("aagam_push_subscription_id");
      if (subscriptionId) {
        await apiClient
          .delete(
            `/notifications/push/subscriptions/${encodeURIComponent(
              subscriptionId
            )}`
          )
          .catch((error) =>
            console.warn(
              "Push subscription cleanup failed during logout",
              error
            )
          );
      }
      await apiClient.post("/auth/logout");
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      localStorage.removeItem("user_role");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_email");
      localStorage.removeItem("user_avatar");
      localStorage.removeItem("access_token");
      localStorage.removeItem("aagam_push_enabled");
      localStorage.removeItem("aagam_push_subscription_id");
      router.push("/login");
    }
  };

  const menuItems = {
    ADMIN: [
      { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
      {
        name: "Partner Applications",
        href: "/admin/partner-applications",
        icon: ClipboardCheck,
      },
      { name: "Analytics", href: "/admin/analytics", icon: BarChart3 },
      { name: "Notifications", href: "/admin/notifications", icon: Bell },
      { name: "Support", href: "/admin/support", icon: Headphones },
      { name: "Dispatch", href: "/admin/dispatch", icon: Bike },
      {
        name: "Delivery Exceptions",
        href: "/admin/delivery-exceptions",
        icon: ShieldAlert,
      },
      { name: "Stores", href: "/admin/stores", icon: Store },
      { name: "Products", href: "/admin/products", icon: Package },
      { name: "Delivery Zones", href: "/admin/delivery-zones", icon: MapPinned },
      { name: "Promotions", href: "/admin/promotions", icon: Megaphone },
      { name: "Riders", href: "/admin/riders", icon: Truck },
      { name: "Orders", href: "/admin/orders", icon: ShoppingCart },
      { name: "Live Tracking", href: "/admin/live-tracking", icon: Radar },
    ],
    RIDER: [
      { name: "Home", href: "/rider", icon: LayoutDashboard },
      { name: "Job Offers", href: "/rider/offers", icon: Bike },
      { name: "Current Delivery", href: "/rider/delivery", icon: Truck },
      { name: "Pickup Tasks", href: "/rider/pickup", icon: Package },
      { name: "Notifications", href: "/rider/notifications", icon: Bell },
      { name: "History", href: "/rider/history", icon: ShoppingCart },
      { name: "Earnings", href: "/rider/earnings", icon: Tag },
      { name: "COD & Settlements", href: "/rider/cod", icon: ShieldAlert },
      { name: "Performance", href: "/rider/performance", icon: BarChart3 },
      { name: "Availability", href: "/rider/availability", icon: Radar },
      { name: "Profile", href: "/rider/profile", icon: User },
      { name: "Support", href: "/rider/support", icon: Headphones },
    ],
    CUSTOMER: [
      { name: "Shop", href: "/shop", icon: ShoppingCart },
      { name: "My Orders", href: "/shop/orders", icon: Package },
      { name: "Notifications", href: "/shop/notifications", icon: Bell },
      { name: "Addresses", href: "/shop/addresses", icon: MapPin },
      { name: "Wishlist", href: "/shop/wishlist", icon: Heart },
      { name: "Deals", href: "/shop/deals", icon: Tag },
      { name: "Reorder", href: "/shop/reorder", icon: RotateCcw },
      { name: "Account", href: "/shop/account", icon: UserCircle },
    ],
    STORE_OWNER: [
      { name: "Dashboard", href: "/store", icon: LayoutDashboard },
      { name: "Notifications", href: "/store/notifications", icon: Bell },
      { name: "Orders", href: "/store/orders", icon: ShoppingCart },
      { name: "Pickup Proof", href: "/store/pickup-proof", icon: ShieldAlert },
      { name: "Inventory", href: "/store/inventory", icon: Package },
      { name: "My Stores", href: "/store/stores", icon: Store },
    ],
  };

  const currentMenu = menuItems[role] || [];
  const quickMenu = currentMenu.slice(0, 4);
  const rootRoutes = new Set(["/admin", "/rider", "/shop", "/store"]);
  const routeIsActive = (href: string) =>
    pathname === href ||
    (!rootRoutes.has(href) && pathname.startsWith(`${href}/`));
  const hiddenRouteIsActive = currentMenu
    .slice(quickMenu.length)
    .some((item) => routeIsActive(item.href));
  const roleLabel =
    role === "STORE_OWNER"
      ? "Store owner"
      : role.charAt(0) + role.slice(1).toLowerCase();

  const renderRiderBadge = (href: string, compact = false) => {
    if (role !== "RIDER" || href !== "/rider/notifications" || riderUnread <= 0) {
      return null;
    }

    if (compact) {
      return <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-red-500" />;
    }

    return (
      <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white">
        {riderUnread > 99 ? "99+" : riderUnread}
      </span>
    );
  };

  return (
    <>
      <aside className="relative z-10 hidden h-screen w-[260px] flex-col bg-slate-950 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_18rem),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.1),transparent_16rem)]" />
        <div className="relative px-5 pt-6 pb-4">
          {role === "CUSTOMER" ? (
            <Link
              href="/shop/account"
              className="-m-1.5 flex items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-white/5"
            >
              {profile.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatarUrl}
                  alt="Profile"
                  className="h-11 w-11 rounded-xl border-2 border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-white/10 bg-gradient-to-br from-teal-500/20 to-amber-500/20 text-sm font-black text-white">
                  {initials}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">
                  {profile.name || "Aagam Customer"}
                </p>
                <p className="truncate text-[11px] font-medium text-slate-400">
                  {profile.email || "Customer Portal"}
                </p>
              </div>
            </Link>
          ) : (
            <AagamLogo inverse label={`${role.toLowerCase()} portal`} />
          )}
        </div>
        <nav className="relative flex-1 overflow-y-auto px-3" aria-label={`${roleLabel} navigation`}>
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Navigation
          </p>
          <div className="space-y-0.5">
            {currentMenu.map((item) => {
              const Icon = item.icon;
              const isActive = routeIsActive(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all ${
                    isActive
                      ? "bg-white text-slate-950 shadow-lg shadow-black/10"
                      : "text-slate-400 hover:bg-white/7 hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                      isActive
                        ? "bg-teal-600 text-white"
                        : "bg-white/5 text-slate-400 group-hover:text-teal-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.name}
                  {renderRiderBadge(item.href)}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="relative border-t border-white/5 px-3 py-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
              <LogOut className="h-4 w-4" />
            </span>
            Sign out
          </button>
        </div>
      </aside>

      <nav
        className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between rounded-2xl border border-white/60 bg-slate-950/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] text-white shadow-[0_20px_60px_rgba(0,0,0,0.4)] backdrop-blur-2xl lg:hidden"
        aria-label="Quick navigation"
      >
        {quickMenu.map((item) => {
          const Icon = item.icon;
          const isActive = routeIsActive(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[9px] font-bold transition ${
                isActive
                  ? "bg-white text-slate-950"
                  : "text-slate-400 active:bg-white/10"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.name}</span>
              {renderRiderBadge(item.href, true)}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open all navigation"
          aria-expanded={mobileMenuOpen}
          aria-controls="responsive-role-navigation"
          className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[9px] font-bold transition ${
            mobileMenuOpen || hiddenRouteIsActive
              ? "bg-white text-slate-950"
              : "text-slate-400 active:bg-white/10"
          }`}
        >
          <Menu className="h-4 w-4" />
          <span className="max-w-full truncate">All menu</span>
        </button>
      </nav>

      {mobileMenuOpen ? (
        <div
          className="fixed inset-0 z-[70] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={`${roleLabel} complete navigation`}
        >
          <button
            type="button"
            aria-label="Close navigation backdrop"
            className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside
            id="responsive-role-navigation"
            className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col overflow-hidden border-l border-white/10 bg-slate-950 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
              <div>
                <AagamLogo inverse label={`${roleLabel} portal`} />
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">
                  Complete navigation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close all navigation"
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-4" aria-label={`${roleLabel} mobile navigation`}>
              <div className="grid gap-2 sm:grid-cols-2">
                {currentMenu.map((item) => {
                  const Icon = item.icon;
                  const isActive = routeIsActive(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`group flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm font-bold transition ${
                        isActive
                          ? "border-white bg-white text-slate-950 shadow-xl"
                          : "border-white/10 bg-white/5 text-slate-300 hover:border-teal-400/40 hover:bg-teal-400/10 hover:text-white"
                      }`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isActive
                            ? "bg-teal-600 text-white"
                            : "bg-white/5 text-slate-400 group-hover:text-teal-300"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      {renderRiderBadge(item.href)}
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3.5 text-sm font-black text-red-200 transition hover:bg-red-500/20"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default Sidebar;

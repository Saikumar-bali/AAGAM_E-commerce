from pathlib import Path


def replace(pathname: str, old: str, new: str) -> None:
    path = Path(pathname)
    source = path.read_text()
    if old in source:
        path.write_text(source.replace(old, new))
        return
    if new in source:
        return
    raise SystemExit(f'Expected source fragment not found in {pathname}: {old}')

login = 'apps/admin-dashboard/src/app/(auth)/login/page.tsx'
replace(login, "import { useRouter } from 'next/navigation';", "import { useRouter, useSearchParams } from 'next/navigation';")
replace(
    login,
    "import { normalizePromotionPlacements } from '@/lib/promotion-normalizer';",
    "import { normalizePromotionPlacements } from '@/lib/promotion-normalizer';\nimport { customerAuthHref, safeCustomerReturnPath } from '@/lib/customer-return-path';",
)
replace(
    login,
    "\nfunction safeCustomerReturnPath(search: string) {\n  const requested = new URLSearchParams(search).get('returnTo');\n  return requested === '/shop' || requested?.startsWith('/shop/') ? requested : '/shop';\n}\n",
    "\n",
)
replace(
    login,
    "export default function LoginPage() {\n  const router = useRouter();",
    "export default function LoginPage() {\n  const router = useRouter();\n  const searchParams = useSearchParams();\n  const customerReturnPath = safeCustomerReturnPath(searchParams.get('returnTo'));",
)
replace(login, "else router.push(safeCustomerReturnPath(window.location.search));", "else router.push(customerReturnPath);")
replace(
    login,
    '<Link href="/signup" className="text-teal-700">Create account</Link>',
    "<Link href={customerAuthHref('/signup', customerReturnPath)} className=\"text-teal-700\">Create account</Link>",
)

web_support = 'apps/admin-dashboard/src/app/(shop)/shop/support/page.tsx'
replace(
    web_support,
    "  const [loadingOrders, setLoadingOrders] = useState(true);",
    "  const [loadingOrders, setLoadingOrders] = useState(true);\n  const [ordersError, setOrdersError] = useState('');",
)
replace(
    web_support,
    "  const loadOrders = useCallback(async () => {\n    setLoadingOrders(true);\n    try {",
    "  const loadOrders = useCallback(async () => {\n    setLoadingOrders(true);\n    setOrdersError('');\n    try {",
)
replace(
    web_support,
    "    } catch {\n      // Global API interceptor shows the backend message.\n    } finally {\n      setLoadingOrders(false);\n    }\n  }, []);",
    "    } catch (requestError: any) {\n      const raw = requestError?.response?.data?.message ?? requestError?.message;\n      setOrdersError(Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' && raw.trim() ? raw : 'Check your connection and try again.');\n    } finally {\n      setLoadingOrders(false);\n    }\n  }, []);",
)
replace(
    web_support,
    "      await loadTicketHistory(orderId);",
    "      if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId);",
)
replace(
    web_support,
    "        ) : orders.length === 0 ? (\n          <section className=\"rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm\"><Package className=\"mx-auto h-10 w-10 text-slate-300\" /><h2 className=\"mt-4 text-xl font-black text-slate-950\">No orders available for support</h2><p className=\"mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500\">Customer tickets are linked to an order so the support team can see the right store, payment and delivery context.</p></section>\n        ) : (",
    "        ) : ordersError ? (\n          <section className=\"rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm\"><AlertCircle className=\"mx-auto h-10 w-10 text-red-500\" /><h2 className=\"mt-4 text-xl font-black text-slate-950\">Could not load your orders</h2><p className=\"mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500\">{ordersError}</p><button type=\"button\" onClick={() => void loadOrders()} className=\"enterprise-button mx-auto mt-5 gap-2\"><RefreshCw className=\"h-4 w-4\" />Try again</button></section>\n        ) : orders.length === 0 ? (\n          <section className=\"rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm\"><Package className=\"mx-auto h-10 w-10 text-slate-300\" /><h2 className=\"mt-4 text-xl font-black text-slate-950\">No orders available for support</h2><p className=\"mx-auto mt-2 max-w-lg text-sm font-semibold leading-6 text-slate-500\">Customer tickets are linked to an order so the support team can see the right store, payment and delivery context.</p></section>\n        ) : (",
)

mobile_support = 'apps/mobile-customer/src/screens/customer/CustomerSupportScreen.tsx'
replace(
    mobile_support,
    "      await loadTicketHistory(orderId);",
    "      if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId);",
)

contract = 'scripts/aagaam-customer-experience.contract.test.js'
replace(
    contract,
    "contains(webLogin, \"requested === '/shop' || requested?.startsWith('/shop/')\", 'Customer authentication must allow only safe relative shop return paths.');",
    "const returnPathHelper = read('apps/admin-dashboard/src/lib/customer-return-path.ts');\ncontains(returnPathHelper, \"requested === '/shop' || requested?.startsWith('/shop/')\", 'Customer authentication must allow only safe relative shop return paths.');",
)
replace(
    contract,
    "contains(webLogin, 'safeCustomerReturnPath(window.location.search)', 'All customer login methods must honor the safe return destination.');",
    "contains(webLogin, \"safeCustomerReturnPath(searchParams.get('returnTo'))\", 'All customer login methods must honor the safe return destination.');\ncontains(webLogin, \"customerAuthHref('/signup', customerReturnPath)\", 'The login create-account link must preserve the validated customer destination.');\nconst signup = read('apps/admin-dashboard/src/app/(auth)/signup/page.tsx');\ncontains(signup, \"safeCustomerReturnPath(searchParams.get('returnTo'))\", 'Customer signup must validate the requested return path.');\ncontains(signup, 'router.push(returnTo)', 'Successful signup must return the customer to the validated destination.');\ncontains(signup, \"customerAuthHref('/login', returnTo)\", 'Signup must preserve the destination when returning to login.');",
)
replace(
    contract,
    "contains(webSupport, 'historyRequestVersion', 'Web support must version ticket-history requests.');",
    "contains(webSupport, 'historyRequestVersion', 'Web support must version ticket-history requests.');\ncontains(webSupport, \"const [ordersError, setOrdersError] = useState('')\", 'Web support must track order-loading failures separately.');\ncontains(webSupport, 'Could not load your orders', 'Web support must render a distinct loading-error state.');\ncontains(webSupport, 'onClick={() => void loadOrders()}', 'Web support must offer an explicit retry action.');\ncontains(webSupport, 'if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId)', 'Web support must not refresh history for an order that is no longer active.');",
)
replace(
    contract,
    "contains(mobileSupport, 'historyRequestVersion', 'Mobile support must version ticket-history requests.');",
    "contains(mobileSupport, 'historyRequestVersion', 'Mobile support must version ticket-history requests.');\ncontains(mobileSupport, 'if (selectedOrderRef.current === orderId) await loadTicketHistory(orderId)', 'Mobile support must not refresh history for an order that is no longer active.');",
)

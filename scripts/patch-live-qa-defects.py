from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise RuntimeError(f"Could not find expected source block for {label}")
    return source.replace(old, new, 1)


inventory_path = Path("apps/admin-dashboard/src/app/(store)/store/inventory/page.tsx")
inventory = inventory_path.read_text()

inventory = replace_once(
    inventory,
    """  const loadStores = useCallback(async () => {\n    const { data } = await apiClient.get('/stores/my-stores');\n    const nextStores: StoreSummary[] = Array.isArray(data) ? data : [];\n    setStores(nextStores);\n    setSelectedStoreId((current) => current || nextStores[0]?.id || '');\n  }, []);""",
    """  const loadStores = useCallback(async () => {\n    setLoading(true);\n    setMessage(null);\n    const { data } = await apiClient.get('/stores/my-stores');\n    const nextStores: StoreSummary[] = Array.isArray(data) ? data : [];\n    setStores(nextStores);\n\n    if (nextStores.length === 0) {\n      inventoryRequestIdRef.current += 1;\n      setSelectedStoreId('');\n      setAssortment([]);\n      setCatalogue([]);\n      setLoading(false);\n      return;\n    }\n\n    setSelectedStoreId((current) =>\n      nextStores.some((store) => store.id === current) ? current : nextStores[0].id,\n    );\n  }, []);""",
    "loadStores empty-state handling",
)

inventory = replace_once(
    inventory,
    """  useEffect(() => {\n    if (selectedStoreId) void loadInventory(selectedStoreId, '');\n    else inventoryRequestIdRef.current += 1;\n  }, [selectedStoreId]);""",
    """  useEffect(() => {\n    if (selectedStoreId) {\n      void loadInventory(selectedStoreId, '');\n      return;\n    }\n    inventoryRequestIdRef.current += 1;\n    setLoading(false);\n  }, [selectedStoreId]);""",
    "selected store loading reset",
)

inventory = replace_once(
    inventory,
    """            <button\n              type=\"button\"\n              onClick={() => void loadInventory(selectedStoreId)}\n              disabled={loading || !selectedStoreId}\n              className=\"inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 disabled:opacity-50\"\n            >""",
    """            <button\n              type=\"button\"\n              onClick={() => selectedStoreId ? void loadInventory(selectedStoreId) : void loadStores()}\n              disabled={loading}\n              className=\"inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-600 disabled:opacity-50\"\n            >""",
    "refresh unassigned store account",
)

inventory = replace_once(
    inventory,
    """        {message ? (\n          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>\n            {message.text}\n          </div>\n        ) : null}\n\n        <div className=\"grid gap-3 sm:grid-cols-3\">""",
    """        {message ? (\n          <div className={`rounded-2xl border px-4 py-3 text-sm font-bold ${message.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>\n            {message.text}\n          </div>\n        ) : null}\n\n        {!loading && stores.length === 0 ? (\n          <div data-testid=\"no-assigned-stores\" className=\"rounded-[2rem] border border-dashed border-amber-200 bg-amber-50 p-10 text-center\">\n            <Package className=\"mx-auto h-14 w-14 text-amber-500\" />\n            <h2 className=\"mt-5 text-xl font-black text-slate-950\">No stores are assigned to this account</h2>\n            <p className=\"mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-600\">Contact an administrator to assign a store before managing products and inventory.</p>\n            <button type=\"button\" onClick={() => void loadStores()} className=\"mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white\">\n              <RefreshCw className=\"h-4 w-4\" /> Check again\n            </button>\n          </div>\n        ) : null}\n\n        <div className=\"grid gap-3 sm:grid-cols-3\">""",
    "assigned store empty-state card",
)

inventory_path.write_text(inventory)

login_path = Path("apps/admin-dashboard/src/app/(auth)/login/page.tsx")
login = login_path.read_text()

login = replace_once(
    login,
    """function resetSessionCache() {\n  ['user_role', 'user_name', 'user_email', 'user_avatar', 'access_token'].forEach((key) => localStorage.removeItem(key));\n}\n""",
    """function resetSessionCache() {\n  ['user_role', 'user_name', 'user_email', 'user_avatar', 'access_token'].forEach((key) => localStorage.removeItem(key));\n}\n\nfunction friendlyAuthError(error: any, fallback: string) {\n  const status = error?.response?.status;\n  const rawMessage = error?.response?.data?.message;\n  const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : typeof rawMessage === 'string' ? rawMessage : '';\n  if (status === 429 || /ThrottlerException|Too Many Requests/i.test(message)) {\n    return 'Too many login attempts. Please try again later.';\n  }\n  return message || fallback;\n}\n""",
    "friendly authentication error helper",
)

login = login.replace("setError(requestError?.response?.data?.message || 'Could not send the verification code.');", "setError(friendlyAuthError(requestError, 'Could not send the verification code.'));", 1)
login = login.replace("setError(requestError?.response?.data?.message || 'Verification code is invalid or expired.');", "setError(friendlyAuthError(requestError, 'Verification code is invalid or expired.'));", 1)
login = login.replace("setError(requestError?.response?.data?.message || 'Invalid credentials');", "setError(friendlyAuthError(requestError, 'Invalid credentials'));", 1)
login = login.replace("setError(requestError?.response?.data?.message || 'Google sign-in failed');", "setError(friendlyAuthError(requestError, 'Google sign-in failed'));", 1)

if "friendlyAuthError(requestError" not in login:
    raise RuntimeError("Authentication error replacements were not applied")

login_path.write_text(login)

spec_path = Path("apps/admin-dashboard/e2e/live-qa-regressions.spec.ts")
spec_path.write_text("""import { expect, test } from '@playwright/test';\nimport { loginWithCookieSession } from '../tests/helpers/login';\n\ntest.describe('Live QA regression protections', () => {\n  test('shows a stable empty state when a Store Owner has no assigned stores', async ({ page }) => {\n    let storeRequestCount = 0;\n    await page.route('**/stores/my-stores', async (route) => {\n      storeRequestCount += 1;\n      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });\n    });\n\n    await loginWithCookieSession(page, 'STORE_OWNER');\n    await page.goto('/store/inventory');\n\n    await expect(page.getByTestId('no-assigned-stores')).toBeVisible();\n    await expect(page.getByRole('heading', { name: 'No stores are assigned to this account' })).toBeVisible();\n    await expect(page.getByText('Contact an administrator to assign a store')).toBeVisible();\n    await expect(page.locator('.animate-pulse')).toHaveCount(0);\n\n    const refresh = page.getByRole('button', { name: 'Refresh' });\n    await expect(refresh).toBeEnabled();\n    await refresh.click();\n    await expect.poll(() => storeRequestCount).toBeGreaterThan(1);\n  });\n\n  test('shows friendly copy instead of a raw throttler exception', async ({ page }) => {\n    await page.route('**/public/promotions/active**', async (route) => {\n      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });\n    });\n    await page.route('**/auth/login', async (route) => {\n      await route.fulfill({\n        status: 429,\n        contentType: 'application/json',\n        body: JSON.stringify({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }),\n      });\n    });\n\n    await page.goto('/login');\n    await page.getByLabel('Email address Phone number or email').fill('qa-store@example.invalid');\n    await page.getByLabel('Password').fill('not-a-real-password');\n    await page.getByRole('button', { name: 'Continue' }).click();\n\n    await expect(page.getByText('Too many login attempts. Please try again later.')).toBeVisible();\n    await expect(page.getByText(/ThrottlerException|Too Many Requests/)).toHaveCount(0);\n  });\n});\n""")

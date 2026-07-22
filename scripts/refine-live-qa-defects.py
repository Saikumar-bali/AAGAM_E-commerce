from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        if new in source:
            return source
        raise RuntimeError(f"Could not find expected block for {label}")
    return source.replace(old, new, 1)


path = Path("apps/admin-dashboard/src/app/(store)/store/inventory/page.tsx")
source = path.read_text()

source = replace_once(
    source,
    """  const [loading, setLoading] = useState(true);\n  const [savingId, setSavingId] = useState<string | null>(null);""",
    """  const [loading, setLoading] = useState(true);\n  const [storesLoaded, setStoresLoaded] = useState(false);\n  const [savingId, setSavingId] = useState<string | null>(null);""",
    "storesLoaded state",
)

source = replace_once(
    source,
    """  const loadStores = useCallback(async () => {\n    setLoading(true);\n    setMessage(null);\n    const { data } = await apiClient.get('/stores/my-stores');\n    const nextStores: StoreSummary[] = Array.isArray(data) ? data : [];\n    setStores(nextStores);\n\n    if (nextStores.length === 0) {\n      inventoryRequestIdRef.current += 1;\n      setSelectedStoreId('');\n      setAssortment([]);\n      setCatalogue([]);\n      setLoading(false);\n      return;\n    }\n\n    setSelectedStoreId((current) =>\n      nextStores.some((store) => store.id === current) ? current : nextStores[0].id,\n    );\n  }, []);""",
    """  const loadStores = useCallback(async () => {\n    setLoading(true);\n    setMessage(null);\n    try {\n      const { data } = await apiClient.get('/stores/my-stores');\n      const nextStores: StoreSummary[] = Array.isArray(data) ? data : [];\n      setStores(nextStores);\n      setStoresLoaded(true);\n\n      if (nextStores.length === 0) {\n        inventoryRequestIdRef.current += 1;\n        setSelectedStoreId('');\n        setAssortment([]);\n        setCatalogue([]);\n        setLoading(false);\n        return;\n      }\n\n      setSelectedStoreId((current) =>\n        nextStores.some((store) => store.id === current) ? current : nextStores[0].id,\n      );\n    } catch (error: any) {\n      setStoresLoaded(false);\n      setLoading(false);\n      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load stores' });\n    }\n  }, []);""",
    "loadStores lifecycle",
)

source = replace_once(
    source,
    """  useEffect(() => {\n    loadStores().catch((error: any) => {\n      setLoading(false);\n      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load stores' });\n    });\n  }, [loadStores]);""",
    """  useEffect(() => {\n    void loadStores();\n  }, [loadStores]);""",
    "initial store load",
)

source = replace_once(
    source,
    """  useEffect(() => {\n    if (selectedStoreId) {\n      void loadInventory(selectedStoreId, '');\n      return;\n    }\n    inventoryRequestIdRef.current += 1;\n    setLoading(false);\n  }, [selectedStoreId]);""",
    """  useEffect(() => {\n    if (selectedStoreId) {\n      void loadInventory(selectedStoreId, '');\n      return;\n    }\n    if (storesLoaded) {\n      inventoryRequestIdRef.current += 1;\n      setLoading(false);\n    }\n  }, [selectedStoreId, storesLoaded]);""",
    "selected store effect",
)

source = replace_once(
    source,
    """  const selectedStore = stores.find((store) => store.id === selectedStoreId);""",
    """  const selectedStore = stores.find((store) => store.id === selectedStoreId);\n  const hasNoAssignedStores = storesLoaded && stores.length === 0;""",
    "no-store derived state",
)

source = replace_once(
    source,
    """        {!loading && stores.length === 0 ? (\n          <div data-testid=\"no-assigned-stores\" className=\"rounded-[2rem] border border-dashed border-amber-200 bg-amber-50 p-10 text-center\">\n            <Package className=\"mx-auto h-14 w-14 text-amber-500\" />\n            <h2 className=\"mt-5 text-xl font-black text-slate-950\">No stores are assigned to this account</h2>\n            <p className=\"mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-600\">Contact an administrator to assign a store before managing products and inventory.</p>\n            <button type=\"button\" onClick={() => void loadStores()} className=\"mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white\">\n              <RefreshCw className=\"h-4 w-4\" /> Check again\n            </button>\n          </div>\n        ) : null}\n\n        <div className=\"grid gap-3 sm:grid-cols-3\">""",
    """        {hasNoAssignedStores ? (\n          <div data-testid=\"no-assigned-stores\" className=\"rounded-[2rem] border border-dashed border-amber-200 bg-amber-50 p-10 text-center\">\n            <Package className=\"mx-auto h-14 w-14 text-amber-500\" />\n            <h2 className=\"mt-5 text-xl font-black text-slate-950\">No stores are assigned to this account</h2>\n            <p className=\"mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-600\">Contact an administrator to assign a store before managing products and inventory.</p>\n            <button type=\"button\" onClick={() => void loadStores()} className=\"mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white\">\n              <RefreshCw className=\"h-4 w-4\" /> Check again\n            </button>\n          </div>\n        ) : (\n          <>\n        <div className=\"grid gap-3 sm:grid-cols-3\">""",
    "empty-state workspace start",
)

source = replace_once(
    source,
    """        )}\n      </div>\n    </DashboardLayout>""",
    """        )}\n          </>\n        )}\n      </div>\n    </DashboardLayout>""",
    "empty-state workspace end",
)

path.write_text(source)

spec_path = Path("apps/admin-dashboard/e2e/live-qa-regressions.spec.ts")
spec = spec_path.read_text()
spec = replace_once(
    spec,
    """    await expect(page.locator('.animate-pulse')).toHaveCount(0);\n\n    const refresh = page.getByRole('button', { name: 'Refresh' });""",
    """    await expect(page.locator('.animate-pulse')).toHaveCount(0);\n    await expect(page.getByRole('tab', { name: 'My products' })).toHaveCount(0);\n    await expect(page.getByRole('tab', { name: 'Add products' })).toHaveCount(0);\n\n    const refresh = page.getByRole('button', { name: 'Refresh' });""",
    "empty-state replacement proof",
)
spec_path.write_text(spec)

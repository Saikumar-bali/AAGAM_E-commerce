from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    file = Path(path)
    text = file.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE)
    if count != 1:
        raise SystemExit(f"Expected regex not found exactly once in {path}: {pattern[:120]!r}; count={count}")
    file.write_text(updated)


# Backend: enforce ownership from the effective role set, not only the primary role.
service_path = "apps/api-gateway/src/stores/store.service.ts"
replace_once(
    service_path,
    "type StoreActor = { id: string; role: Role };",
    "type StoreActor = { id: string; role: Role; roles?: Role[] };",
)
replace_regex(
    service_path,
    r"    if \(actor\.role === Role\.STORE_OWNER && store\.ownerId !== actor\.id\) \{\n\s+throw new ForbiddenException\('You can only update inventory for your own stores'\);\n\s+\}",
    "    const effectiveRoles = new Set<Role>([actor.role, ...(actor.roles || [])]);\n"
    "    if (!effectiveRoles.has(Role.ADMIN) && store.ownerId !== actor.id) {\n"
    "      throw new ForbiddenException('You can only update inventory for your own stores');\n"
    "    }",
)

api_spec_path = "apps/api-gateway/src/store-assortment.spec.ts"
api_marker = "  it('rejects a store selling price above Admin MRP', async () => {\n"
api_tests = """  it('enforces ownership when STORE_OWNER is an effective secondary role', async () => {
    const extra = await prisma.product.create({
      data: {
        name: `${PREFIX}secondary-role-product`,
        price: 35,
        pricePaise: 3500,
        mrpPaise: 3800,
        categoryId: (await prisma.category.findFirstOrThrow({ where: { name: `${PREFIX}category` } })).id,
      },
    });

    const effectiveStoreOwner = {
      id: otherOwnerId,
      role: Role.CUSTOMER,
      roles: [Role.CUSTOMER, Role.STORE_OWNER],
    };
    await expect(service.getStoreAssortment(storeId, effectiveStoreOwner)).rejects.toThrow(
      'You can only update inventory for your own stores',
    );
    await expect(
      service.addStoreProduct(storeId, { productId: extra.id, openingQuantity: 3 }, effectiveStoreOwner),
    ).rejects.toThrow('You can only update inventory for your own stores');
  });

  it('allows an effective Admin to review any store without weakening owner checks', async () => {
    const result = await service.getStoreAssortment(storeId, {
      id: otherOwnerId,
      role: Role.CUSTOMER,
      roles: [Role.CUSTOMER, Role.ADMIN],
    });
    expect(result.map((item) => item.productId)).toContain(productId);
  });

"""
replace_once(api_spec_path, api_marker, api_tests + api_marker)


# Mobile: strict draft parsing prevents malformed inputs from becoming stock zero or cleared prices.
Path("apps/mobile-partners/src/domain/storeInventory.ts").write_text("""export type StoreInventoryDraft = {
  quantity: string;
  sellingPrice: string;
};

export type ValidatedStoreInventoryDraft =
  | { valid: true; quantity: number; sellingPrice: number | null }
  | { valid: false; message: string };

export const parseWholeQuantity = (value: string | number): number | null => {
  const normalized = String(value).trim();
  if (!/^\\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000) return null;
  return parsed;
};

const parseOptionalPrice = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    return { valid: true as const, value: null };
  }
  const normalized = String(value).trim();
  if (!/^\\d+(?:\\.\\d+)?$/.test(normalized)) return { valid: false as const, value: null };

  const [wholePart, fractionPart = ''] = normalized.split('.');
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole < 0) return { valid: false as const, value: null };
  const fraction = `${fractionPart}000`;
  let paise = whole * 100 + Number(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) paise += 1;
  if (!Number.isSafeInteger(paise)) return { valid: false as const, value: null };

  return { valid: true as const, value: paise / 100 };
};

export const validateStoreInventoryDraft = (
  draft: StoreInventoryDraft,
  quantityLabel = 'Stock',
): ValidatedStoreInventoryDraft => {
  const quantity = parseWholeQuantity(draft.quantity);
  if (quantity === null) {
    return {
      valid: false,
      message: `${quantityLabel} must be a whole number between 0 and 1,000,000.`,
    };
  }
  const price = parseOptionalPrice(draft.sellingPrice);
  if (!price.valid) {
    return { valid: false, message: 'Store price must be a valid non-negative amount.' };
  }
  return { valid: true, quantity, sellingPrice: price.value };
};

export const availableForSale = (item: {
  quantity: number;
  isListed: boolean;
  autoHideWhenOutOfStock: boolean;
}) => item.isListed && (item.quantity > 0 || !item.autoHideWhenOutOfStock);

export const defaultDraft = (quantity = 0, sellingPricePaise?: number | null): StoreInventoryDraft => ({
  quantity: String(quantity),
  sellingPrice: sellingPricePaise == null ? '' : String(sellingPricePaise / 100),
});
""")

Path("apps/mobile-partners/src/domain/storeInventory.spec.ts").write_text("""import {
  availableForSale,
  defaultDraft,
  parseWholeQuantity,
  validateStoreInventoryDraft,
} from './storeInventory';

describe('store inventory domain helpers', () => {
  it('accepts only explicit non-negative whole quantities', () => {
    expect(parseWholeQuantity('12')).toBe(12);
    expect(parseWholeQuantity('')).toBeNull();
    expect(parseWholeQuantity('12.9')).toBeNull();
    expect(parseWholeQuantity('-5')).toBeNull();
    expect(parseWholeQuantity('invalid')).toBeNull();
    expect(parseWholeQuantity('1000001')).toBeNull();
  });

  it('validates a complete mutation draft without inventing values', () => {
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '39.995' })).toEqual({
      valid: true,
      quantity: 12,
      sellingPrice: 40,
    });
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '' })).toEqual({
      valid: true,
      quantity: 12,
      sellingPrice: null,
    });
    expect(validateStoreInventoryDraft({ quantity: '', sellingPrice: '40' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12.5', sellingPrice: '40' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: '-1' }).valid).toBe(false);
    expect(validateStoreInventoryDraft({ quantity: '12', sellingPrice: 'invalid' }).valid).toBe(false);
  });

  it('uses Admin price when no store-specific price exists', () => {
    expect(defaultDraft(25, null)).toEqual({ quantity: '25', sellingPrice: '' });
    expect(defaultDraft(25, 3999)).toEqual({ quantity: '25', sellingPrice: '39.99' });
  });

  it('applies store listing and out-of-stock visibility rules', () => {
    expect(availableForSale({ quantity: 5, isListed: true, autoHideWhenOutOfStock: true })).toBe(true);
    expect(availableForSale({ quantity: 0, isListed: true, autoHideWhenOutOfStock: true })).toBe(false);
    expect(availableForSale({ quantity: 0, isListed: true, autoHideWhenOutOfStock: false })).toBe(true);
    expect(availableForSale({ quantity: 10, isListed: false, autoHideWhenOutOfStock: false })).toBe(false);
  });
});
""")

mobile_screen = "apps/mobile-partners/src/screens/store/StoreInventoryScreen.tsx"
replace_once(
    mobile_screen,
    """  defaultDraft,
  normalizeOptionalPrice,
  normalizeWholeQuantity,
  StoreInventoryDraft,
""",
    """  defaultDraft,
  parseWholeQuantity,
  StoreInventoryDraft,
  validateStoreInventoryDraft,
""",
)
old_mutations = """  const addMutation = useMutation({
    mutationFn: ({ product, draft }: { product: Product; draft: StoreInventoryDraft }) =>
      storeService.addStoreProduct(selectedStoreId, {
        productId: product.id,
        openingQuantity: normalizeWholeQuantity(draft.quantity),
        sellingPrice: normalizeOptionalPrice(draft.sellingPrice),
        isListed: true,
        autoHideWhenOutOfStock: true,
      }),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', selectedStoreId], (current = []) => [
        ...current,
        data,
      ].sort((a, b) => a.product.name.localeCompare(b.product.name)));
      queryClient.setQueryData(['store-catalogue', selectedStoreId, submittedSearch], (current: any) => ({
        ...(current || {}),
        items: (current?.items || []).filter((product: Product) => product.id !== variables.product.id),
        total: Math.max(0, Number(current?.total || 1) - 1),
      }));
      setSection('mine');
      Toast.show({
        type: 'success',
        text1: 'Product added',
        text2: `${variables.product.name} is now part of this store.`,
      });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Could not add product',
        text2: error?.response?.data?.message || 'Please try again.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ item, draft, policy }: {
      item: InventoryItem;
      draft: StoreInventoryDraft;
      policy?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>;
    }) => storeService.updateInventory(selectedStoreId, {
      productId: item.productId,
      quantity: normalizeWholeQuantity(draft.quantity),
      sellingPrice: normalizeOptionalPrice(draft.sellingPrice),
      isListed: policy?.isListed ?? item.isListed,
      autoHideWhenOutOfStock: policy?.autoHideWhenOutOfStock ?? item.autoHideWhenOutOfStock,
    }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', selectedStoreId], (current = []) =>
        current.map((item) => item.id === variables.item.id ? { ...item, ...data } : item),
      );
      setEditDrafts((current) => ({
        ...current,
        [variables.item.id]: defaultDraft(data.quantity, data.sellingPricePaise),
      }));
      Toast.show({ type: 'success', text1: 'Inventory updated', text2: variables.item.product.name });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: error?.response?.data?.message || 'Please try again.',
      });
    },
  });
"""
new_mutations = """  const addMutation = useMutation({
    mutationFn: ({ storeId, product, draft }: { storeId: string; product: Product; draft: StoreInventoryDraft }) => {
      const parsed = validateStoreInventoryDraft(draft, 'Opening stock');
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.addStoreProduct(storeId, {
        productId: product.id,
        openingQuantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: true,
        autoHideWhenOutOfStock: true,
      });
    },
    onSuccess: async (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', variables.storeId], (current = []) => [
        ...current,
        data,
      ].sort((a, b) => a.product.name.localeCompare(b.product.name)));
      queryClient.setQueryData(['store-catalogue', variables.storeId, submittedSearch], (current: any) => ({
        ...(current || {}),
        items: (current?.items || []).filter((product: Product) => product.id !== variables.product.id),
        total: Math.max(0, Number(current?.total || 1) - 1),
      }));
      if (variables.storeId === selectedStoreId) setSection('mine');
      Toast.show({
        type: 'success',
        text1: 'Product added',
        text2: `${variables.product.name} is now part of this store.`,
      });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Could not add product',
        text2: error?.response?.data?.message || error?.message || 'Please try again.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ storeId, item, draft, policy }: {
      storeId: string;
      item: InventoryItem;
      draft: StoreInventoryDraft;
      policy?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>;
    }) => {
      const parsed = validateStoreInventoryDraft(draft);
      if (!parsed.valid) throw new Error(parsed.message);
      return storeService.updateInventory(storeId, {
        productId: item.productId,
        quantity: parsed.quantity,
        sellingPrice: parsed.sellingPrice,
        isListed: policy?.isListed ?? item.isListed,
        autoHideWhenOutOfStock: policy?.autoHideWhenOutOfStock ?? item.autoHideWhenOutOfStock,
      });
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<InventoryItem[]>(['store-assortment', variables.storeId], (current = []) =>
        current.map((item) => item.id === variables.item.id ? { ...item, ...data } : item),
      );
      setEditDrafts((current) => ({
        ...current,
        [variables.item.id]: defaultDraft(data.quantity, data.sellingPricePaise),
      }));
      Toast.show({ type: 'success', text1: 'Inventory updated', text2: variables.item.product.name });
    },
    onError: (error: any) => {
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: error?.response?.data?.message || error?.message || 'Please try again.',
      });
    },
  });
"""
replace_once(mobile_screen, old_mutations, new_mutations)
replace_once(mobile_screen, "const quantity = normalizeWholeQuantity(draft.quantity);", "const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;")
replace_once(mobile_screen, "updateMutation.isPending && updateMutation.variables?.item.id === item.id", "updateMutation.isPending && updateMutation.variables?.storeId === selectedStoreId && updateMutation.variables?.item.id === item.id")
replace_once(mobile_screen, "updateMutation.mutate({ item, draft })", "updateMutation.mutate({ storeId: selectedStoreId, item, draft })")
replace_once(mobile_screen, "updateMutation.mutate({ item, draft, policy: { isListed: !item.isListed } })", "updateMutation.mutate({ storeId: selectedStoreId, item, draft, policy: { isListed: !item.isListed } })")
replace_once(mobile_screen, "updateMutation.mutate({ item, draft, policy: { autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock } })", "updateMutation.mutate({ storeId: selectedStoreId, item, draft, policy: { autoHideWhenOutOfStock: !item.autoHideWhenOutOfStock } })")
replace_once(mobile_screen, "addMutation.isPending && addMutation.variables?.product.id === product.id", "addMutation.isPending && addMutation.variables?.storeId === selectedStoreId && addMutation.variables?.product.id === product.id")
replace_once(mobile_screen, "addMutation.mutate({ product, draft })", "addMutation.mutate({ storeId: selectedStoreId, product, draft })")


# Web: sequence reads and capture mutation store IDs so late Store A work cannot overwrite Store B.
web_path = "apps/admin-dashboard/src/app/(store)/store/inventory/page.tsx"
replace_once(
    web_path,
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    "import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';",
)
replace_once(
    web_path,
    """const money = (paise?: number | null, fallbackRupees = 0) =>
  `₹${((paise == null ? fallbackRupees * 100 : paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
""",
    """const money = (paise?: number | null, fallbackRupees = 0) =>
  `₹${((paise == null ? fallbackRupees * 100 : paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;

const parseWholeQuantity = (value: string): number | null => {
  const normalized = value.trim();
  if (!/^\\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed <= 1_000_000 ? parsed : null;
};

const parseOptionalPrice = (value: string) => {
  const normalized = value.trim();
  if (normalized === '') return { valid: true as const, value: null };
  if (!/^\\d+(?:\\.\\d+)?$/.test(normalized)) return { valid: false as const, value: null };
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return { valid: false as const, value: null };
  return { valid: true as const, value: parsed };
};
""",
)
replace_once(
    web_path,
    """  const [addDrafts, setAddDrafts] = useState<Record<string, Draft>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, Draft>>({});
""",
    """  const [addDrafts, setAddDrafts] = useState<Record<string, Draft>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, Draft>>({});
  const inventoryRequestIdRef = useRef(0);
  const selectedStoreIdRef = useRef(selectedStoreId);
  selectedStoreIdRef.current = selectedStoreId;
""",
)
old_load = """  const loadInventory = useCallback(async (storeId: string, query = search) => {
    if (!storeId) return;
    setLoading(true);
    setMessage(null);
    try {
      const [assortmentResult, catalogueResult] = await Promise.all([
        apiClient.get(`/stores/${storeId}/assortment`),
        apiClient.get(`/stores/${storeId}/catalog`, {
          params: { page: 1, pageSize: 50, search: query || undefined },
        }),
      ]);
      const nextAssortment: InventoryItem[] = Array.isArray(assortmentResult.data)
        ? assortmentResult.data
        : [];
      const nextCatalogue: Product[] = catalogueResult.data?.items || [];
      setAssortment(nextAssortment);
      setCatalogue(nextCatalogue);
      setEditDrafts(Object.fromEntries(nextAssortment.map((item) => [
        item.id,
        {
          quantity: String(item.quantity),
          sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
        },
      ])));
      setAddDrafts((current) => {
        const next = { ...current };
        nextCatalogue.forEach((product) => {
          next[product.id] ||= { quantity: '0', sellingPrice: '' };
        });
        return next;
      });
    } catch (error: any) {
      setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load store products' });
    } finally {
      setLoading(false);
    }
  }, [search]);
"""
new_load = """  const loadInventory = useCallback(async (storeId: string, query = search) => {
    if (!storeId) return;
    const requestId = ++inventoryRequestIdRef.current;
    setLoading(true);
    setMessage(null);
    try {
      const [assortmentResult, catalogueResult] = await Promise.all([
        apiClient.get(`/stores/${storeId}/assortment`),
        apiClient.get(`/stores/${storeId}/catalog`, {
          params: { page: 1, pageSize: 50, search: query || undefined },
        }),
      ]);
      if (requestId !== inventoryRequestIdRef.current || selectedStoreIdRef.current !== storeId) return;
      const nextAssortment: InventoryItem[] = Array.isArray(assortmentResult.data)
        ? assortmentResult.data
        : [];
      const nextCatalogue: Product[] = catalogueResult.data?.items || [];
      setAssortment(nextAssortment);
      setCatalogue(nextCatalogue);
      setEditDrafts(Object.fromEntries(nextAssortment.map((item) => [
        item.id,
        {
          quantity: String(item.quantity),
          sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
        },
      ])));
      setAddDrafts((current) => {
        const next = { ...current };
        nextCatalogue.forEach((product) => {
          next[product.id] ||= { quantity: '0', sellingPrice: '' };
        });
        return next;
      });
    } catch (error: any) {
      if (requestId === inventoryRequestIdRef.current && selectedStoreIdRef.current === storeId) {
        setMessage({ tone: 'error', text: error?.response?.data?.message || 'Failed to load store products' });
      }
    } finally {
      if (requestId === inventoryRequestIdRef.current && selectedStoreIdRef.current === storeId) {
        setLoading(false);
      }
    }
  }, [search]);
"""
replace_once(web_path, old_load, new_load)
replace_once(
    web_path,
    """  useEffect(() => {
    if (selectedStoreId) void loadInventory(selectedStoreId, '');
  }, [selectedStoreId]);
""",
    """  useEffect(() => {
    if (selectedStoreId) void loadInventory(selectedStoreId, '');
    else inventoryRequestIdRef.current += 1;
  }, [selectedStoreId]);
""",
)
old_add_start = """  const addProduct = async (product: Product) => {
    if (!selectedStoreId) return;
    const draft = addDrafts[product.id] || { quantity: '0', sellingPrice: '' };
    const openingQuantity = Number(draft.quantity);
    const sellingPrice = draft.sellingPrice === '' ? null : Number(draft.sellingPrice);
    if (!Number.isInteger(openingQuantity) || openingQuantity < 0) {
      setMessage({ tone: 'error', text: 'Opening stock must be a whole number of zero or more.' });
      return;
    }
"""
new_add_start = """  const addProduct = async (product: Product) => {
    const storeId = selectedStoreId;
    if (!storeId) return;
    const draft = addDrafts[product.id] || { quantity: '0', sellingPrice: '' };
    const openingQuantity = parseWholeQuantity(draft.quantity);
    const parsedPrice = parseOptionalPrice(draft.sellingPrice);
    if (openingQuantity === null) {
      setMessage({ tone: 'error', text: 'Opening stock must be a whole number between 0 and 1,000,000.' });
      return;
    }
    if (!parsedPrice.valid) {
      setMessage({ tone: 'error', text: 'Store price must be a valid non-negative amount.' });
      return;
    }
    const sellingPrice = parsedPrice.value;
"""
replace_once(web_path, old_add_start, new_add_start)
replace_once(web_path, "apiClient.post(`/stores/${selectedStoreId}/assortment`,", "apiClient.post(`/stores/${storeId}/assortment`,")
replace_once(
    web_path,
    """      });
      setAssortment((current) => [...current, data].sort((a, b) => a.product.name.localeCompare(b.product.name)));
""",
    """      });
      if (selectedStoreIdRef.current !== storeId) return;
      setAssortment((current) => [...current, data].sort((a, b) => a.product.name.localeCompare(b.product.name)));
""",
)
old_save_start = """  const saveItem = async (item: InventoryItem, patch?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>) => {
    const draft = editDrafts[item.id] || {
      quantity: String(item.quantity),
      sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
    };
    const quantity = Number(draft.quantity);
    const sellingPrice = draft.sellingPrice === '' ? null : Number(draft.sellingPrice);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage({ tone: 'error', text: 'Stock must be a whole number of zero or more.' });
      return;
    }
"""
new_save_start = """  const saveItem = async (item: InventoryItem, patch?: Partial<Pick<InventoryItem, 'isListed' | 'autoHideWhenOutOfStock'>>) => {
    const storeId = selectedStoreId;
    if (!storeId) return;
    const draft = editDrafts[item.id] || {
      quantity: String(item.quantity),
      sellingPrice: item.sellingPricePaise == null ? '' : String(item.sellingPricePaise / 100),
    };
    const quantity = parseWholeQuantity(draft.quantity);
    const parsedPrice = parseOptionalPrice(draft.sellingPrice);
    if (quantity === null) {
      setMessage({ tone: 'error', text: 'Stock must be a whole number between 0 and 1,000,000.' });
      return;
    }
    if (!parsedPrice.valid) {
      setMessage({ tone: 'error', text: 'Store price must be a valid non-negative amount.' });
      return;
    }
    const sellingPrice = parsedPrice.value;
"""
replace_once(web_path, old_save_start, new_save_start)
replace_once(web_path, "apiClient.patch(`/stores/${selectedStoreId}/inventory`,", "apiClient.patch(`/stores/${storeId}/inventory`,")
replace_once(
    web_path,
    """      });
      setAssortment((current) => current.map((row) => row.id === item.id ? { ...row, ...data } : row));
""",
    """      });
      if (selectedStoreIdRef.current !== storeId) return;
      setAssortment((current) => current.map((row) => row.id === item.id ? { ...row, ...data } : row));
""",
)
replace_once(web_path, "const quantity = Number(draft.quantity || 0);", "const quantity = parseWholeQuantity(draft.quantity) ?? item.quantity;")


# Browser regression proof for rapid store switching.
e2e_path = Path("apps/admin-dashboard/e2e/store-assortment-inventory.spec.ts")
e2e = e2e_path.read_text()
stale_test = r'''

  test('ignores stale Store A responses after switching to Store B', async ({ page }) => {
    const stores = [
      { id: 'store-a', name: 'Store A', address: 'A address' },
      { id: 'store-b', name: 'Store B', address: 'B address' },
    ];
    const makeInventory = (storeId: string, suffix: string) => ({
      id: `inventory-${suffix}`,
      storeId,
      productId: `product-${suffix}`,
      quantity: 7,
      isListed: true,
      autoHideWhenOutOfStock: true,
      sellingPricePaise: 2500,
      product: {
        id: `product-${suffix}`,
        name: `Store ${suffix.toUpperCase()} Product`,
        price: 25,
        pricePaise: 2500,
        mrpPaise: 3000,
        categoryId: 'test',
        category: { id: 'test', name: 'Test' },
        image: null,
        isActive: true,
        sortOrder: 1,
      },
    });

    let releaseStoreA!: () => void;
    const storeAGate = new Promise<void>((resolve) => { releaseStoreA = resolve; });
    let signalStoreAStarted!: () => void;
    const storeAStarted = new Promise<void>((resolve) => { signalStoreAStarted = resolve; });

    await page.route('**/stores/my-stores', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stores) });
    });
    await page.route('**/stores/store-a/assortment', async (route) => {
      signalStoreAStarted();
      await storeAGate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([makeInventory('store-a', 'a')]) });
    });
    await page.route('**/stores/store-a/catalog**', async (route) => {
      await storeAGate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }) });
    });
    await page.route('**/stores/store-b/assortment', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([makeInventory('store-b', 'b')]) });
    });
    await page.route('**/stores/store-b/catalog**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }) });
    });

    await loginWithCookieSession(page, 'STORE_OWNER');
    await page.goto('/store/inventory');
    await storeAStarted;
    await page.getByLabel('Select store').selectOption('store-b');
    await expect(page.getByText(/Managing Store B/)).toBeVisible();
    await expect(page.getByTestId('my-products-grid')).toContainText('Store B Product');

    releaseStoreA();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('my-products-grid')).toContainText('Store B Product');
    await expect(page.getByTestId('my-products-grid')).not.toContainText('Store A Product');
  });
'''
if "ignores stale Store A responses after switching to Store B" in e2e:
    raise SystemExit("Stale-response test is already present")
insert_at = e2e.rfind("\n});")
if insert_at < 0:
    raise SystemExit("Could not find final Playwright describe close")
e2e_path.write_text(e2e[:insert_at] + stale_test + e2e[insert_at:])

print("PR #97 reviewed source fixes applied successfully.")

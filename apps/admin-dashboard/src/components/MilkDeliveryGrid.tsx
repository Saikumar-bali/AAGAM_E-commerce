'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiClient } from '@aagam/utils';
import {
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Milk,
  Moon,
  Phone,
  RefreshCw,
  Search,
  Share2,
  Sun,
  Truck,
  X,
  Zap,
  Smartphone,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Send,
  Copy,
  ArrowUpDown,
  Sparkles,
  CheckCheck,
  Maximize2,
  Minimize2,
  Scale,
  Package,
  Camera,
  UserCheck,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '@/components/ToastProvider';

interface GridCell {
  deliveryId: string;
  sequenceNumber: number;
  status: string;
  deliverySlot: string;
  baseQuantity: string;
  extraMilk: string | null;
  cashCollectedPaise: number;
  cashDuePaise: number;
  paymentMode: 'CASH' | 'PHONE_PE' | 'DUE' | null;
  note: string | null;
  planLabel: string | null;
  assignedRider?: {
    id: string;
    name: string;
    phone: string;
    routeCode?: string;
  } | null;
  photoProof?: {
    id: string;
    storageKey: string;
    capturedAt: string;
    gpsLat?: number | null;
    gpsLng?: number | null;
    accuracyMetres?: number | null;
    cashCollectedPaise?: number;
    signedUrl?: string | null;
  } | null;
}

interface PlanInfo {
  name: string;
  dailyQuantity: string;
  dayRange: string;
}

interface GridRow {
  subscriptionId: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    address: string;
    customerType: 'online' | 'offline';
  };
  plan: {
    id: string;
    name: string;
    code: string;
    dailyQuantity: string;
  };
  slot: string;
  defaultRider?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
  temporaryRider?: {
    id: string;
    name: string;
    phone?: string;
    startDate?: string | null;
    endDate?: string | null;
  } | null;
  allPlans: PlanInfo[];
  days: Record<number, GridCell | null>;
  totalDeliveredDays: number;
  totalExtraLiters: number;
  totalLiters: number;
  totalCollectedPaise: number;
  totalDuePaise: number;
}

interface GridData {
  year: number;
  month: number;
  daysInMonth: number;
  totalSubscribers: number;
  rows: GridRow[];
  dailyTotals: Record<number, { deliveredCount: number; scheduledCount: number; totalLiters: number; cashCollectedPaise: number }>;
}

type AddonUnitType = 'weight' | 'count' | 'volume' | 'custom';

interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  unit?: string;
  categoryName?: string;
  weightGrams?: number | null;
  details?: any;
}

interface AddonPreset {
  label: string;
  qtyLabel: string;
  multiplier: number;
}

function detectProductUnitType(product?: { name: string; unit?: string; categoryName?: string; details?: any }): AddonUnitType {
  if (!product) return 'volume';
  const name = (product.name || '').toLowerCase();
  const unit = (product.unit || product.details?.unit || '').toLowerCase();
  const category = (product.categoryName || product.details?.category || '').toLowerCase();

  // 1. Explicit unit match
  if (['g', 'gm', 'gms', 'gram', 'grams', 'kg', 'kgs', 'kilo', 'kilogram'].includes(unit)) {
    return 'weight';
  }
  if (['l', 'ltr', 'liter', 'liters', 'litre', 'litres', 'ml'].includes(unit)) {
    return 'volume';
  }
  if (['bowl', 'bowls', 'plate', 'plates', 'pack', 'packs', 'packet', 'packets', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'box', 'boxes', 'bunch', 'bunches', 'tray', 'dozen'].includes(unit)) {
    return 'count';
  }

  // 2. Bowl / Pack / Prepared item check
  if (name.includes('bowl') || name.includes('salad') || name.includes('sprout') || name.includes('combo') || name.includes('meal') || name.includes('box') || name.includes('bunch') || name.includes('dozen') || name.includes('bread') || name.includes('egg')) {
    return 'count';
  }

  // 3. Liquid / Dairy check
  if (
    category.includes('dairy') || 
    category.includes('milk') || 
    category.includes('beverage') || 
    category.includes('juice') || 
    category.includes('oil') ||
    name.includes('milk') || 
    name.includes('curd') || 
    name.includes('dahi') || 
    name.includes('lassi') || 
    name.includes('buttermilk') || 
    name.includes('juice') || 
    name.includes('ghee') || 
    name.includes('oil') ||
    name.includes('water')
  ) {
    return 'volume';
  }

  // 4. Produce / Fruits / Vegetables / Dry fruits / Groceries default to weight
  return 'weight';
}

function getAddonPresets(unitType: AddonUnitType, product?: CatalogProduct): AddonPreset[] {
  if (unitType === 'weight') {
    return [
      { label: '250g (0.25 kg)', qtyLabel: '250g', multiplier: 0.25 },
      { label: '500g (0.5 kg)', qtyLabel: '500g', multiplier: 0.5 },
      { label: '1 kg (Standard)', qtyLabel: '1 kg', multiplier: 1.0 },
      { label: '1.5 kg', qtyLabel: '1.5 kg', multiplier: 1.5 },
      { label: '2 kg (2x)', qtyLabel: '2 kg', multiplier: 2.0 },
      { label: '3 kg (3x)', qtyLabel: '3 kg', multiplier: 3.0 },
      { label: '5 kg (Bulk)', qtyLabel: '5 kg', multiplier: 5.0 },
    ];
  }

  if (unitType === 'count') {
    const nameLower = (product?.name || '').toLowerCase();
    const isBowl = nameLower.includes('bowl');
    const isPack = nameLower.includes('pack') || nameLower.includes('box');
    const isBunch = nameLower.includes('bunch');
    const isPiece = nameLower.includes('piece') || nameLower.includes('egg');
    
    const singular = isBowl ? 'Bowl' : isPack ? 'Pack' : isBunch ? 'Bunch' : isPiece ? 'Piece' : 'Unit';
    const plural = isBowl ? 'Bowls' : isPack ? 'Packs' : isBunch ? 'Bunches' : isPiece ? 'Pieces' : 'Units';
    
    const weightGrams = product?.weightGrams || (product?.details?.weight ? parseInt(product.details.weight) : null);
    const weightNote = weightGrams ? ` (~${weightGrams}g)` : '';

    return [
      { label: `1 ${singular}${weightNote}`, qtyLabel: `1 ${singular}${weightNote}`, multiplier: 1.0 },
      { label: `2 ${plural}${weightGrams ? ` (~${weightGrams * 2}g)` : ''}`, qtyLabel: `2 ${plural}`, multiplier: 2.0 },
      { label: `3 ${plural}${weightGrams ? ` (~${weightGrams * 3}g)` : ''}`, qtyLabel: `3 ${plural}`, multiplier: 3.0 },
      { label: `4 ${plural}`, qtyLabel: `4 ${plural}`, multiplier: 4.0 },
      { label: `5 ${plural}`, qtyLabel: `5 ${plural}`, multiplier: 5.0 },
    ];
  }

  if (unitType === 'volume') {
    return [
      { label: '0.25 Liter (250 ml)', qtyLabel: '0.25L', multiplier: 0.25 },
      { label: '0.5 Liter (500 ml)', qtyLabel: '0.5L', multiplier: 0.5 },
      { label: '1 Liter (1x)', qtyLabel: '1L', multiplier: 1.0 },
      { label: '1.5 Liters (1.5x)', qtyLabel: '1.5L', multiplier: 1.5 },
      { label: '2 Liters (2x)', qtyLabel: '2L', multiplier: 2.0 },
      { label: '3 Liters (3x)', qtyLabel: '3L', multiplier: 3.0 },
    ];
  }

  return [];
}

export default function MilkDeliveryGrid({ onReload, storeId }: { onReload?: () => void; storeId?: string }) {
  const toast = useToast();
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth()); // 0-indexed
  const [gridData, setGridData] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [slotFilter, setSlotFilter] = useState<'ALL' | 'AM' | 'PM'>('ALL');
  const [dueFilter, setDueFilter] = useState<'ALL' | 'DUE'>('ALL');
  const [customerTypeFilter, setCustomerTypeFilter] = useState<'ALL' | 'online' | 'offline'>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'cards'>('grid');
  const [mobileSortMode, setMobileSortMode] = useState<'pending-first' | 'sequence'>('pending-first');
  const [hideCompletedOnMobile, setHideCompletedOnMobile] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      if (gridContainerRef.current?.requestFullscreen) {
        gridContainerRef.current.requestFullscreen().catch(() => {
          setIsFullscreen((prev) => !prev);
        });
      } else {
        setIsFullscreen((prev) => !prev);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Modal / Popover States
  const [selectedCell, setSelectedCell] = useState<{ row: GridRow; day: number; cell: GridCell | null } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchData, setDispatchData] = useState<any>(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [statementData, setStatementData] = useState<any>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  // Custom action inputs & Dynamic Products
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('custom');
  const [customProductName, setCustomProductName] = useState<string>('Buffalo Milk');
  const [customUnitPrice, setCustomUnitPrice] = useState<string>('80');
  const [addonUnitMode, setAddonUnitMode] = useState<AddonUnitType>('volume');
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string>('1L');
  const [customQtyText, setCustomQtyText] = useState<string>('1 Unit');
  const [customQtyMultiplier, setCustomQtyMultiplier] = useState<string>('1.0');
  const [extraTargetSlot, setExtraTargetSlot] = useState<'PM' | 'AM'>('PM');
  const [modalTab, setModalTab] = useState<'actions' | 'extra' | 'payment'>('actions');
  const [consecutiveDays, setConsecutiveDays] = useState(4);
  const [paymentAmount, setPaymentAmount] = useState('80');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'PHONE_PE'>('CASH');

  // Rider Dispatch States
  const [dispatchRiderModalOpen, setDispatchRiderModalOpen] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<
    Array<{ id: string; name: string; phone: string; status: string; pendingRunCount: number }>
  >([]);
  const [selectedRiderId, setSelectedRiderId] = useState('');
  const [bulkDispatchSlot, setBulkDispatchSlot] = useState<'AM' | 'PM' | 'ALL'>('ALL');
  const [bulkDispatchType, setBulkDispatchType] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [riderDispatchSubmitting, setRiderDispatchSubmitting] = useState(false);
  const [dispatchTargetDayNum, setDispatchTargetDayNum] = useState<number>(today.getDate());
  const [saveAsDefaultRider, setSaveAsDefaultRider] = useState<boolean>(false);
  const [autoDispatching, setAutoDispatching] = useState<boolean>(false);
  const [cellDefaultRiderChecked, setCellDefaultRiderChecked] = useState<boolean>(false);
  const [dispatchMode, setDispatchMode] = useState<'SINGLE_DAY' | 'DATE_RANGE'>('SINGLE_DAY');
  const [dispatchRangeStartDay, setDispatchRangeStartDay] = useState<number>(today.getDate());
  const [dispatchRangeEndDay, setDispatchRangeEndDay] = useState<number>(Math.min(today.getDate() + 4, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
  const [saveAsTemporaryRange, setSaveAsTemporaryRange] = useState<boolean>(false);

  // Single cell temporary rider assignment states
  const [cellTempRiderId, setCellTempRiderId] = useState<string>('');
  const [cellTempStartDate, setCellTempStartDate] = useState<string>('');
  const [cellTempEndDate, setCellTempEndDate] = useState<string>('');
  const [cellTempApplyDeliveries, setCellTempApplyDeliveries] = useState<boolean>(true);
  const [cellTempSubmitting, setCellTempSubmitting] = useState<boolean>(false);

  // Photo proof viewing state
  const [viewingPhotoProof, setViewingPhotoProof] = useState<any | null>(null);
  const [viewingPhotoUrl, setViewingPhotoUrl] = useState<string | null>(null);
  const [loadingPhotoUrl, setLoadingPhotoUrl] = useState(false);

  // Load live catalog products for dynamic dropdowns. Store owners cannot read
  // `/admin/products` and must only be offered what their own store carries, so
  // prefer the store assortment (which also brings stock/listing and the
  // store-specific selling price).
  useEffect(() => {
    let isMounted = true;
    const isStorePortal = typeof window !== 'undefined' && window.location.pathname.startsWith('/store');
    if (isStorePortal && !storeId) {
      return;
    }
    const endpoint = storeId ? `/stores/${storeId}/assortment` : '/products';
    apiClient
      .get(endpoint)
      .then((res) => {
        if (!isMounted) return;
        const raw = Array.isArray(res.data) ? res.data : [];
        const list = storeId
          ? raw
              // Mirror ProductService.attachAvailability: a store row is
              // sellable only when listed and not auto-hidden at zero stock.
              .filter(
                (row: any) =>
                  row?.product &&
                  !row.product.deletedAt &&
                  row.isListed === true &&
                  !(row.autoHideWhenOutOfStock !== false && row.quantity === 0),
              )
              .map((row: any) => ({
                ...row.product,
                price:
                  row.sellingPricePaise != null
                    ? row.sellingPricePaise / 100
                    : row.product.price,
              }))
          : raw;
        const formatted: CatalogProduct[] = list
          .filter((p: any) => p.isActive !== false)
          .map((p: any) => ({
            id: p.id,
            name: p.name,
            price: Number(p.price || 0),
            unit: p.details?.unit || '',
            categoryName: p.category?.name || '',
            weightGrams: p.weightGrams ?? (p.details?.weight ? parseInt(p.details.weight) : null),
            details: p.details || {},
          }));
        if (formatted.length > 0) {
          setCatalogProducts(formatted);
          const defaultProd =
            formatted.find((p) => p.name.toLowerCase().includes('buffalo') || p.name.toLowerCase().includes('milk')) ||
            formatted[0];
          if (defaultProd) {
            setSelectedProductId(defaultProd.id);
            setCustomUnitPrice(String(defaultProd.price));
            setCustomProductName(defaultProd.name);
            const mode = detectProductUnitType(defaultProd);
            setAddonUnitMode(mode);
            const presets = getAddonPresets(mode, defaultProd);
            setSelectedPresetLabel(presets[mode === 'weight' ? 1 : mode === 'volume' ? 2 : 0]?.qtyLabel || '1L');
          }
        }
      })
      .catch(() => {
        // With a store context, do not fall back to the global catalogue: it
        // would re-surface products this store does not carry. An empty list is
        // fine here because the grid always offers the custom product.
        if (storeId) return;
        apiClient
          .get('/products')
          .then((res) => {
            if (!isMounted) return;
            const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
            const formatted: CatalogProduct[] = items.map((p: any) => ({
              id: p.id,
              name: p.name,
              price: Number(p.price || 0),
              unit: p.details?.unit || '',
              categoryName: p.category?.name || '',
              weightGrams: p.weightGrams ?? (p.details?.weight ? parseInt(p.details.weight) : null),
              details: p.details || {},
            }));
            if (formatted.length > 0) {
              setCatalogProducts(formatted);
              const defaultProd =
                formatted.find((p) => p.name.toLowerCase().includes('milk')) || formatted[0];
              if (defaultProd) {
                setSelectedProductId(defaultProd.id);
                setCustomUnitPrice(String(defaultProd.price));
                setCustomProductName(defaultProd.name);
                const mode = detectProductUnitType(defaultProd);
                setAddonUnitMode(mode);
                const presets = getAddonPresets(mode, defaultProd);
                setSelectedPresetLabel(presets[mode === 'weight' ? 1 : mode === 'volume' ? 2 : 0]?.qtyLabel || '1L');
              }
            }
          })
          .catch(() => {});
      });
    return () => {
      isMounted = false;
    };
  }, [storeId]);

  // Close cell modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedCell) {
        setSelectedCell(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell]);

  const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === currentMonth;
  const currentDayNum = today.getDate();

  // Detect mobile screen on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);

  const loadGrid = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/store/subscriptions/grid', {
        params: { year: currentYear, month: currentMonth },
      });
      setGridData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load milk grid data');
    } finally {
      setLoading(false);
    }
  }, [currentYear, currentMonth, toast]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  // Jump / auto-scroll to today's date column
  const jumpToToday = useCallback(() => {
    if (!scrollContainerRef.current) return;
    const todayCol = document.getElementById('grid-col-today');
    if (todayCol) {
      const container = scrollContainerRef.current;
      const colLeft = todayCol.offsetLeft;
      const frozenOffset = 296; // width of frozen columns
      const targetScroll = colLeft - frozenOffset - (container.clientWidth - frozenOffset) / 3;
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  }, []);

  // Automatically scroll to today once grid finishes loading
  useEffect(() => {
    if (!loading && gridData && isCurrentMonth && viewMode === 'grid') {
      const timer = setTimeout(jumpToToday, 300);
      return () => clearTimeout(timer);
    }
  }, [loading, gridData, isCurrentMonth, viewMode, jumpToToday]);

  const changeMonth = (delta: number) => {
    let nextMonth = currentMonth + delta;
    let nextYear = currentYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear--;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    }
    setCurrentMonth(nextMonth);
    setCurrentYear(nextYear);
  };

  // Cell quick action
  const handleQuickAction = async (
    deliveryId: string,
    actionType: 'TOGGLE_DELIVERED' | 'SKIP' | 'EXTRA_MILK' | 'TOGGLE_SLOT' | 'RECORD_PAYMENT' | 'ATTACH_EVENING_MILK',
    options?: { extraQuantity?: string; amountPaise?: number; extraPaise?: number; paymentMode?: 'CASH' | 'PHONE_PE'; note?: string; consecutiveDays?: number; targetSlot?: 'AM' | 'PM' },
  ) => {
    setActionLoading(true);
    try {
      const res = await apiClient.post(`/store/subscriptions/deliveries/${deliveryId}/quick-action`, {
        type: actionType,
        ...options,
      });
      toast.success(
        actionType === 'ATTACH_EVENING_MILK'
          ? (res.data?.message || 'Attached evening buffalo milk successfully!')
          : actionType === 'TOGGLE_DELIVERED'
          ? 'Delivery status updated!'
          : actionType === 'EXTRA_MILK'
          ? 'Extra milk added!'
          : actionType === 'SKIP'
          ? 'Delivery marked as skipped!'
          : actionType === 'TOGGLE_SLOT'
          ? 'Shift toggled!'
          : 'Payment recorded!',
      );
      setSelectedCell(null);
      await loadGrid();
      if (onReload) onReload();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Quick action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Export to Google Sheets CSV
  const handleExportCsv = async () => {
    try {
      toast.info('Downloading Google Sheets compatible CSV...');
      const res = await apiClient.get('/store/subscriptions/grid/export-csv', {
        params: { year: currentYear, month: currentMonth },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Aagam_Milk_Delivery_Bowluwada_${currentYear}_${currentMonth + 1}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV downloaded! You can open directly in Google Sheets or Excel.');
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  // Open Dispatch Summary
  const openDispatchSummary = async () => {
    setDispatchModalOpen(true);
    setDispatchLoading(true);
    try {
      const res = await apiClient.get('/store/subscriptions/dispatch-summary');
      setDispatchData(res.data);
    } catch {
      toast.error('Could not load dispatch summary');
    } finally {
      setDispatchLoading(false);
    }
  };

  // Open Customer Statement
  const openStatement = async (subscriptionId: string) => {
    setStatementModalOpen(true);
    setStatementLoading(true);
    try {
      const res = await apiClient.get(`/store/subscriptions/customer/${subscriptionId}/statement`);
      setStatementData(res.data);
    } catch {
      toast.error('Could not load statement');
    } finally {
      setStatementLoading(false);
    }
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!gridData?.rows) return [];
    return gridData.rows.filter((r) => {
      const matchesSearch =
        search === '' ||
        r.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        r.customer.phone.includes(search) ||
        r.customer.address.toLowerCase().includes(search.toLowerCase()) ||
        r.plan.name.toLowerCase().includes(search.toLowerCase());
      const matchesSlot = slotFilter === 'ALL' || r.slot === slotFilter;
      const matchesDue = dueFilter === 'ALL' || r.totalDuePaise > 0;
      const matchesType = customerTypeFilter === 'ALL' || r.customer.customerType === customerTypeFilter;
      return matchesSearch && matchesSlot && matchesDue && matchesType;
    });
  }, [gridData, search, slotFilter, dueFilter, customerTypeFilter]);

  const monthLabel = new Date(currentYear, currentMonth, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  // Calculate stats for today's route
  const todayStats = useMemo(() => {
    if (!gridData?.rows) return { totalStops: 0, deliveredStops: 0, pendingStops: 0, totalLiters: 0, cashCollected: 0 };
    let delivered = 0;
    let pending = 0;
    let liters = 0;
    let cash = 0;
    let stops = 0;

    gridData.rows.forEach((r) => {
      const c = r.days[currentDayNum];
      if (c) {
        stops++;
        if (c.status === 'DELIVERED') delivered++;
        else if (c.status === 'SCHEDULED') pending++;
        cash += c.cashCollectedPaise;
        const qty = parseFloat(c.extraMilk || c.baseQuantity) || 1;
        liters += qty;
      }
    });

    return { totalStops: stops, deliveredStops: delivered, pendingStops: pending, totalLiters: liters, cashCollected: cash };
  }, [gridData, currentDayNum]);

  // Split into pending deliveries (active route) and completed deliveries (done today)
  const mobileRouteData = useMemo(() => {
    const pending: Array<{ row: GridRow; originalIndex: number }> = [];
    const completed: Array<{ row: GridRow; originalIndex: number }> = [];

    filteredRows.forEach((row, idx) => {
      const cell = row.days[currentDayNum];
      const isDelivered = cell?.status === 'DELIVERED';
      const isSkipped = cell?.status === 'SKIPPED';

      if (isDelivered || isSkipped) {
        completed.push({ row, originalIndex: idx });
      } else {
        pending.push({ row, originalIndex: idx });
      }
    });

    return {
      pending,
      completed,
    };
  }, [filteredRows, currentDayNum]);

  // Load active riders for dispatch
  const loadAvailableRiders = useCallback(async () => {
    try {
      const res = await apiClient.get('/store/subscriptions/available-riders');
      const riders = Array.isArray(res.data) ? res.data : [];
      setAvailableRiders(riders);
      if (riders.length > 0 && !selectedRiderId) {
        setSelectedRiderId(riders[0].id);
      }
      return riders;
    } catch {
      return [];
    }
  }, [selectedRiderId]);

  useEffect(() => {
    if (selectedCell && availableRiders.length === 0) {
      void loadAvailableRiders();
    }
  }, [selectedCell, availableRiders.length, loadAvailableRiders]);

  // Open Rider Dispatch Modal
  const openRiderDispatchModal = async () => {
    setDispatchRiderModalOpen(true);
    setDispatchTargetDayNum(currentDayNum);
    setSaveAsDefaultRider(false);
    await loadAvailableRiders();
    const ids: string[] = [];
    filteredRows.forEach((row) => {
      const cell = row.days[currentDayNum];
      if (cell && cell.status !== 'DELIVERED' && cell.status !== 'SKIPPED') {
        ids.push(cell.deliveryId);
      }
    });
    setSelectedDeliveryIds(ids);
  };

  // Switch target date in dispatch modal
  const handleTargetDayChange = (newDay: number) => {
    setDispatchTargetDayNum(newDay);
    const ids: string[] = [];
    filteredRows.forEach((row) => {
      const cell = row.days[newDay];
      if (cell && cell.status !== 'DELIVERED' && cell.status !== 'SKIPPED') {
        if (bulkDispatchSlot !== 'ALL' && cell.deliverySlot !== bulkDispatchSlot) return;
        if (bulkDispatchType === 'ONLINE' && row.customer.customerType !== 'online') return;
        if (bulkDispatchType === 'OFFLINE' && row.customer.customerType !== 'offline') return;
        ids.push(cell.deliveryId);
      }
    });
    setSelectedDeliveryIds(ids);
  };

  // Submit Rider Dispatch
  const handleDispatchToRider = async () => {
    if (!selectedRiderId) {
      toast.error('Please choose an approved rider');
      return;
    }
    if (selectedDeliveryIds.length === 0) {
      toast.error('Please select at least one delivery stop');
      return;
    }
    setRiderDispatchSubmitting(true);
    try {
      const res = await apiClient.post('/store/subscriptions/dispatch-to-rider', {
        riderProfileId: selectedRiderId,
        deliveryIds: selectedDeliveryIds,
        slot: bulkDispatchSlot === 'ALL' ? undefined : bulkDispatchSlot,
        saveAsDefaultRider,
      });
      toast.success(
        `Successfully dispatched ${res.data?.dispatchedCount || selectedDeliveryIds.length} orders to ${
          res.data?.riderName || 'rider'
        }!${saveAsDefaultRider ? ' (Saved as permanent default rider)' : ''}`
      );
      setDispatchRiderModalOpen(false);
      setSelectedDeliveryIds([]);
      await loadGrid();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to dispatch to rider');
    } finally {
      setRiderDispatchSubmitting(false);
    }
  };

  // 1-Click Auto-Dispatch all stops that have a pre-assigned default rider
  const handleAutoDispatchDefaultRiders = async () => {
    setAutoDispatching(true);
    try {
      const targetYear = gridData?.year || today.getFullYear();
      const targetMonth = gridData?.month !== undefined ? gridData.month : today.getMonth();
      const targetDate = new Date(Date.UTC(targetYear, targetMonth, dispatchTargetDayNum));
      const dateStr = targetDate.toISOString().slice(0, 10);

      const res = await apiClient.post('/store/subscriptions/auto-dispatch-default-riders', {
        dateStr,
        slot: bulkDispatchSlot === 'ALL' ? undefined : bulkDispatchSlot,
        channel: bulkDispatchType === 'ALL' ? undefined : bulkDispatchType,
      });

      if (res.data?.dispatchedCount === 0) {
        toast.info(res.data?.message || 'No orders with pre-assigned default riders found for this date.');
      } else {
        const breakdownStr = Object.values(res.data?.riderBreakdown || {})
          .map((r: any) => `${r.name}: ${r.count}`)
          .join(', ');
        toast.success(`⚡ Auto-dispatched ${res.data.dispatchedCount} orders! (${breakdownStr})`);
        setDispatchRiderModalOpen(false);
        setSelectedDeliveryIds([]);
        await loadGrid();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to auto-dispatch default riders');
    } finally {
      setAutoDispatching(false);
    }
  };

  // Assign single delivery to rider with optional default rider setting
  const handleAssignSingleRider = async (deliveryId: string, riderId: string, saveDefault?: boolean) => {
    if (!riderId) return;
    setActionLoading(true);
    try {
      const res = await apiClient.post('/store/subscriptions/dispatch-to-rider', {
        riderProfileId: riderId,
        deliveryIds: [deliveryId],
        saveAsDefaultRider: saveDefault,
      });
      toast.success(
        `Delivery assigned to ${res.data?.riderName || 'rider'}!${
          saveDefault ? ' (Saved as permanent default rider)' : ''
        }`
      );
      setSelectedCell(null);
      await loadGrid();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to assign to rider');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Photo Proof Viewer
  const openPhotoProof = async (proof: any) => {
    setViewingPhotoProof(proof);
    setViewingPhotoUrl(null);
    setLoadingPhotoUrl(true);
    try {
      const res = await apiClient.get(`/upload/evidence-url?key=${encodeURIComponent(proof.storageKey)}`);
      setViewingPhotoUrl(res.data?.url || res.data?.signedUrl);
    } catch {
      toast.error('Could not load photo proof');
    } finally {
      setLoadingPhotoUrl(false);
    }
  };

  // Deliveries eligible for rider dispatch for selected target day
  const dispatchEligibleStops = useMemo(() => {
    const list: Array<{ row: GridRow; cell: GridCell }> = [];
    filteredRows.forEach((row) => {
      const cell = row.days[dispatchTargetDayNum];
      if (!cell) return;
      if (bulkDispatchSlot !== 'ALL' && cell.deliverySlot !== bulkDispatchSlot) return;
      if (bulkDispatchType === 'ONLINE' && row.customer.customerType !== 'online') return;
      if (bulkDispatchType === 'OFFLINE' && row.customer.customerType !== 'offline') return;
      list.push({ row, cell });
    });
    return list;
  }, [filteredRows, dispatchTargetDayNum, bulkDispatchSlot, bulkDispatchType]);

  // Stops on target day that already have a pre-assigned default rider
  const stopsWithDefaultRider = useMemo(() => {
    return dispatchEligibleStops.filter((s) => !!s.row.defaultRider);
  }, [dispatchEligibleStops]);

  // Render individual delivery card
  const renderDeliveryCard = (row: GridRow, displayIndex: number, originalIndex: number, isPending: boolean) => {
    const cell = row.days[currentDayNum];
    const isDelivered = cell?.status === 'DELIVERED';
    const isSkipped = cell?.status === 'SKIPPED';
    const hasExtra = !!cell?.extraMilk;
    const hasCash = cell && cell.cashCollectedPaise > 0;

    return (
      <div
        key={row.subscriptionId}
        className={`rounded-xl border p-4 transition-all shadow-xs ${
          isDelivered
            ? 'border-emerald-200 bg-emerald-50/40 text-slate-700'
            : isSkipped
            ? 'border-red-200 bg-red-50/40 opacity-75'
            : 'border-slate-200 bg-white hover:border-emerald-400 hover: ring-1 ring-slate-100'
        }`}
      >
        {/* Card Top: Stop Index, Customer, Plan, Slot */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`flex h-5.5 min-w-5.5 px-1.5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  isDelivered
                    ? 'bg-emerald-100 text-emerald-800'
                    : isPending
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {isDelivered ? '✓' : `#${displayIndex + 1}`}
              </span>
              <h4 className="font-semibold text-slate-900 text-sm">{row.customer.name}</h4>
              <span className={`inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[8px] font-semibold leading-none ${
                row.customer.customerType === 'offline'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}>
                {row.customer.customerType === 'offline' ? 'OFFLINE' : 'ONLINE'}
              </span>
              {isPending && mobileSortMode === 'pending-first' && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-500">
                  Seq #{originalIndex + 1}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">{row.customer.address}</p>
            {cell?.assignedRider ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 rounded px-1.5 py-0.5 border border-purple-200 w-fit">
                <Truck className="h-3 w-3 text-purple-600" />
                <span>Rider: {cell.assignedRider.name}</span>
              </div>
            ) : row.defaultRider ? (
              <div className="mt-1 flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 rounded px-1.5 py-0.5 border border-indigo-200 w-fit">
                <UserCheck className="h-3 w-3 text-indigo-600" />
                <span>Default: {row.defaultRider.name}</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              {row.plan.dailyQuantity}
            </span>
            <span
              className={`inline-flex items-center justify-center h-4.5 px-1.5 rounded text-[9px] font-semibold ${
                row.slot === 'AM' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {row.slot}
            </span>
          </div>
        </div>

        {/* Phone with 1-tap call button */}
        <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
          <a
            href={`tel:${row.customer.phone}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Phone className="h-3 w-3 text-emerald-600" />
            <span>{row.customer.phone}</span>
          </a>

          {/* Delivery Status Badge & Proof */}
          <div className="flex items-center gap-1.5">
            {cell?.photoProof && (
              <button
                onClick={() => openPhotoProof(cell.photoProof)}
                className="inline-flex items-center gap-1 rounded-md bg-teal-50 border border-teal-200 px-2 py-0.5 text-[11px] font-semibold text-teal-800 hover:bg-teal-100 transition-colors shadow-2xs"
                title="View Camera & GPS proof"
              >
                <Camera className="h-3 w-3 text-teal-600" />
                Proof
              </button>
            )}
            {isDelivered ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-2xs">
                <Check className="h-3 w-3 stroke-[3]" />
                Delivered {hasExtra ? `(${cell?.extraMilk})` : ''}
              </span>
            ) : isSkipped ? (
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 line-through">
                Skipped
              </span>
            ) : (
              <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Pending Next
              </span>
            )}
          </div>
        </div>

        {/* Payment Info */}
        {hasCash && (
          <div className="mt-2 rounded-lg bg-emerald-100/60 px-2.5 py-1 text-[11px] font-bold text-emerald-800 flex justify-between items-center">
            <span>Collected Today:</span>
            <span className="font-semibold">₹{cell!.cashCollectedPaise / 100} ({cell!.paymentMode || 'CASH'})</span>
          </div>
        )}

        {/* 1-Tap Fast Delivery Actions */}
        {cell && (
          <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5">
            {!isDelivered ? (
              <button
                disabled={actionLoading}
                onClick={() => handleQuickAction(cell.deliveryId, 'TOGGLE_DELIVERED')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:scale-98 transition-all shadow-xs"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Mark Delivered</span>
              </button>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => handleQuickAction(cell.deliveryId, 'TOGGLE_DELIVERED')}
                className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Undo
              </button>
            )}

            <button
              onClick={() => setSelectedCell({ row, day: currentDayNum, cell })}
              className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
              title="Add extra milk, change shift or record payment"
            >
              + Extra / Pay
            </button>

            <button
              onClick={() => openStatement(row.subscriptionId)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 transition-colors"
              title="Monthly Bill WhatsApp"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={gridContainerRef}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col bg-slate-100 p-3 md:p-4 overflow-hidden font-sans'
          : 'space-y-4 font-sans'
      }
    >
      {/* Control & Navigation Bar */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 md:p-4 shadow-xs">
        {/* Row 1: View Switcher, Month Navigation & Quick Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left Controls: View Mode & Month Navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* View Mode Switcher */}
            <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold shrink-0">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all ${
                  viewMode === 'cards'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Smartphone className="h-3 w-3" />
                <span>Today&apos;s Route</span>
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-all ${
                  viewMode === 'grid'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                <span>31-Day Matrix</span>
              </button>
            </div>

            {/* Month Switcher */}
            <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-50 p-0.5 shrink-0">
              <button
                onClick={() => changeMonth(-1)}
                className="rounded-lg p-1 font-bold text-slate-600 hover:bg-white hover:shadow-xs transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-24 text-center text-xs font-semibold text-slate-800">{monthLabel}</span>
              <button
                onClick={() => changeMonth(1)}
                className="rounded-lg p-1 font-bold text-slate-600 hover:bg-white hover:shadow-xs transition-colors"
                title="Next Month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Jump to Today Button */}
            {isCurrentMonth && viewMode === 'grid' && (
              <button
                onClick={jumpToToday}
                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 transition-all shrink-0"
                title="Scroll instantly to today's date column"
              >
                <Zap className="h-3 w-3 fill-amber-300 text-amber-300" />
                <span>Today ({currentDayNum})</span>
              </button>
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={openRiderDispatchModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-purple-800 transition-all active:scale-95"
              title="Delegate deliveries to an active rider"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Dispatch to Rider</span>
            </button>

            <button
              onClick={openDispatchSummary}
              className="inline-flex items-center gap-1 rounded-xl bg-amber-400 px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-xs hover:bg-amber-300 transition-all"
            >
              <Truck className="h-3.5 w-3.5" />
              <span>Pack Summary</span>
            </button>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-emerald-800 transition-all"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>Export Sheets</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className={`inline-flex items-center gap-1 rounded-xl border px-2 py-1 text-xs font-semibold transition-all ${
                isFullscreen
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-xs'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'View Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>

            <button
              onClick={() => void loadGrid()}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-slate-600 hover:bg-slate-50 transition-colors"
              title="Refresh Grid"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Search, Filters & Route Sort Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-1 flex-wrap items-center gap-2 min-w-48">
            {/* Search Box */}
            <div className="relative min-w-56 flex-1 md:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search customer, phone, locality..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8.5 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-7 text-xs font-semibold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Route Slot Filter */}
            <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-bold">
              <button
                onClick={() => setSlotFilter('ALL')}
                className={`rounded-lg px-2 py-1 ${slotFilter === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                All
              </button>
              <button
                onClick={() => setSlotFilter('AM')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${slotFilter === 'AM' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                <Sun className="h-3 w-3 text-amber-500" /> AM
              </button>
              <button
                onClick={() => setSlotFilter('PM')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 ${slotFilter === 'PM' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                <Moon className="h-3 w-3 text-indigo-500" /> PM
              </button>
            </div>

            {/* Due Filter */}
            <button
              onClick={() => setDueFilter(dueFilter === 'ALL' ? 'DUE' : 'ALL')}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition-all border ${
                dueFilter === 'DUE' ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {dueFilter === 'DUE' ? '⚠️ Only Dues' : 'Filter Dues'}
            </button>

            {/* Customer Type Filter */}
            <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px] font-bold">
              <button
                onClick={() => setCustomerTypeFilter('ALL')}
                className={`rounded-lg px-2 py-1 ${customerTypeFilter === 'ALL' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-500'}`}
              >
                All
              </button>
              <button
                onClick={() => setCustomerTypeFilter('online')}
                className={`rounded-lg px-2 py-1 ${customerTypeFilter === 'online' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'}`}
              >
                🌐 Online
              </button>
              <button
                onClick={() => setCustomerTypeFilter('offline')}
                className={`rounded-lg px-2 py-1 ${customerTypeFilter === 'offline' ? 'bg-white text-amber-700 shadow-xs' : 'text-slate-500'}`}
              >
                🏪 Offline
              </button>
            </div>
          </div>

          {/* Route Card Sorting Controls (only visible in cards view) */}
          {viewMode === 'cards' && (
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-[11px]">
                <button
                  onClick={() => setMobileSortMode('pending-first')}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1 ${
                    mobileSortMode === 'pending-first' ? 'bg-white text-emerald-800 shadow-xs font-semibold' : 'text-slate-500'
                  }`}
                  title="Next deliveries on top, completed pushed to bottom"
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>Pending First</span>
                </button>
                <button
                  onClick={() => setMobileSortMode('sequence')}
                  className={`rounded-lg px-2.5 py-1 ${
                    mobileSortMode === 'sequence' ? 'bg-white text-emerald-800 shadow-xs font-semibold' : 'text-slate-500'
                  }`}
                  title="Keep stops in original sequence 1..N"
                >
                  # Sequence
                </button>
              </div>

              {todayStats.deliveredStops > 0 && (
                <button
                  onClick={() => setHideCompletedOnMobile(!hideCompletedOnMobile)}
                  className={`rounded-xl px-2.5 py-1 text-[11px] font-bold border transition-colors ${
                    hideCompletedOnMobile
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {hideCompletedOnMobile ? 'Show Done' : `Hide Done (${todayStats.deliveredStops})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm font-bold text-slate-700">Loading milk delivery data...</p>
          <p className="text-xs text-slate-400">Reconciling Bowluwada deliveries, extra liters, and cash flow</p>
        </div>
      ) : !gridData || filteredRows.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <Milk className="h-10 w-10 text-slate-300" />
          <h3 className="mt-2 text-base font-semibold text-slate-800">No subscriber records found</h3>
          <p className="text-xs text-slate-500">No active deliveries matched your current month or search filters.</p>
        </div>
      ) : viewMode === 'cards' ? (
        /* MOBILE-FIRST ROUTE CARDS VIEW WITH DYNAMIC PENDING-FIRST SORTING */
        <div className={`space-y-4 ${isFullscreen ? 'overflow-y-auto flex-1 pb-16' : 'pb-28'}`}>
          {/* Today's Route Progress Bar */}
          <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-emerald-100">Today&apos;s Route Checklist</p>
                <h3 className="text-base font-semibold">
                  Day {currentDayNum} · {monthLabel}
                </h3>
              </div>
              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="text-[10px] font-bold uppercase text-emerald-100">Completed</p>
                  <p className="text-lg font-semibold">{todayStats.deliveredStops} / {todayStats.totalStops}</p>
                </div>
                <div className="border-l border-emerald-400/60 pl-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-100">Total Pack</p>
                  <p className="text-lg font-semibold">{todayStats.totalLiters} L</p>
                </div>
              </div>
            </div>
            {/* Progress line */}
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-700/50">
              <div
                className="h-full bg-white transition-all duration-500 rounded-full"
                style={{
                  width: `${todayStats.totalStops > 0 ? (todayStats.deliveredStops / todayStats.totalStops) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Pending Deliveries Section (Next Stops) */}
          {mobileSortMode === 'pending-first' ? (
            <>
              {/* 1. Upcoming Pending Stops */}
              {mobileRouteData.pending.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <Truck className="h-4 w-4 text-amber-500" />
                      <span>Upcoming Deliveries ({mobileRouteData.pending.length} Stops Remaining)</span>
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Next stop on top</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {mobileRouteData.pending.map((item, idx) =>
                      renderDeliveryCard(item.row, idx, item.originalIndex, true)
                    )}
                  </div>
                </div>
              )}

              {/* All Completed Celebration */}
              {mobileRouteData.pending.length === 0 && mobileRouteData.completed.length > 0 && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-5 text-center text-emerald-950 shadow-xs">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <h4 className="mt-2 text-base font-semibold">All Deliveries Completed for Today!</h4>
                  <p className="text-xs text-emerald-800 mt-1">
                    Total {todayStats.deliveredStops} stops delivered · {todayStats.totalLiters}L milk distributed · ₹{todayStats.cashCollected / 100} cash collected.
                  </p>
                </div>
              )}

              {/* 2. Completed Stops (Sunk to Bottom) */}
              {mobileRouteData.completed.length > 0 && !hideCompletedOnMobile && (
                <div className="space-y-2 pt-2 border-t border-slate-200/80">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <CheckCheck className="h-4 w-4 text-emerald-600" />
                      <span>Delivered Today ({mobileRouteData.completed.length} Completed)</span>
                    </h4>
                    <button
                      onClick={() => setHideCompletedOnMobile(true)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600"
                    >
                      Hide Completed
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {mobileRouteData.completed.map((item, idx) =>
                      renderDeliveryCard(item.row, idx, item.originalIndex, false)
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Sequence Mode: All in original order */
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((row, index) => renderDeliveryCard(row, index, index, false))}
            </div>
          )}
        </div>
      ) : (
        /* FULL 31-DAY SPREADSHEET MATRIX VIEW */
        <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs ${isFullscreen ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          <div ref={scrollContainerRef} className={`overflow-x-auto scroll-smooth ${isFullscreen ? 'flex-1 max-h-[calc(100vh-140px)]' : 'max-h-[750px]'}`}>
            <table className="w-full border-collapse text-left text-xs">
              {/* Table Header */}
              <thead className="sticky top-0 z-20 bg-slate-100 text-[11px] font-semibold text-slate-700 shadow-xs">
                <tr>
                  {/* Clean Frozen Column 1: Index */}
                  <th className="sticky left-0 z-30 min-w-10 max-w-10 w-10 bg-slate-100 px-1 py-3 text-center border-r border-b border-slate-200">
                    #
                  </th>

                  {/* Clean Frozen Column 2: Customer Info */}
                  <th className="sticky left-10 z-30 min-w-52 max-w-52 w-52 bg-slate-100 px-3 py-3 border-r border-b border-slate-200 shadow-xs text-left">
                    Customer
                  </th>

                  {/* Clean Frozen Column 3: Plan & Slot */}
                  <th className="sticky left-[calc(2.5rem+13rem)] z-30 min-w-44 max-w-44 w-44 bg-slate-100 px-3 py-3 border-r-2 border-b border-slate-300 shadow-xs text-left">
                    Plan & Slot
                  </th>

                  {/* Days 1 to 31 */}
                  {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dateObj = new Date(currentYear, currentMonth, day);
                    const dayName = dateObj.toLocaleDateString('en-IN', { weekday: 'narrow' });
                    const isToday = isCurrentMonth && day === currentDayNum;

                    return (
                      <th
                        key={day}
                        id={isToday ? 'grid-col-today' : undefined}
                        className={`min-w-[58px] max-w-[58px] px-1 py-2 text-center border-r border-b transition-all ${
                          isToday
                            ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 border-emerald-500  z-20'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      >
                        <span
                          className={`block text-[9px] uppercase tracking-wider font-semibold ${
                            isToday ? 'text-emerald-100 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {isToday ? 'TODAY' : dayName}
                        </span>
                        <span className={`block font-semibold ${isToday ? 'text-sm text-white' : 'text-xs text-slate-800'}`}>
                          {day}
                        </span>
                      </th>
                    );
                  })}

                  {/* Summary Columns */}
                  <th className="min-w-20 bg-slate-100 px-2 py-3 text-center border-r border-b border-slate-200">Total L</th>
                  <th className="min-w-24 bg-slate-100 px-2 py-3 text-right border-r border-b border-slate-200">Paid</th>
                  <th className="min-w-24 bg-slate-100 px-2 py-3 text-right border-r border-b border-slate-200">Due</th>
                  <th className="min-w-16 bg-slate-100 px-2 py-3 text-center border-b border-slate-200">Bill</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredRows.map((row, rowIndex) => (
                  <tr key={row.subscriptionId} className="hover:bg-slate-50/80 transition-colors group">
                    {/* # Index Column */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 px-1 py-2 text-center font-bold text-slate-400 border-r border-slate-200 min-w-10 max-w-10">
                      {rowIndex + 1}
                    </td>

                    {/* Customer Info */}
                    <td className="sticky left-10 z-10 bg-white group-hover:bg-slate-50/90 px-3 py-2 border-r border-slate-200 shadow-xs min-w-52 max-w-52">
                      <div className="flex items-center gap-1.5">
                        <div className="font-semibold text-slate-900 truncate max-w-[140px]">{row.customer.name}</div>
                        <span className={`inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[8px] font-semibold leading-none ${
                          row.customer.customerType === 'offline'
                            ? 'bg-amber-100 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-600 border border-blue-200'
                        }`}>
                          {row.customer.customerType === 'offline' ? 'OFF' : 'ON'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                        <Phone className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                        <span>{row.customer.phone}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[180px]">{row.customer.address}</div>
                      {row.defaultRider && (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-purple-700 mt-0.5" title={`Pre-assigned default rider: ${row.defaultRider.name}`}>
                          <UserCheck className="h-2.5 w-2.5 text-purple-600 shrink-0" />
                          <span className="truncate max-w-[170px]">Default: {row.defaultRider.name}</span>
                        </div>
                      )}
                    </td>

                    {/* Plan & Slot */}
                    <td className="sticky left-[calc(2.5rem+13rem)] z-10 bg-white group-hover:bg-slate-50/90 px-3 py-2 border-r-2 border-slate-300 shadow-xs min-w-44 max-w-44">
                      <div className="font-semibold text-slate-900 text-[11px] truncate max-w-[150px]">{row.plan.name}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="inline-block rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                          {row.plan.dailyQuantity}
                        </span>
                        <span
                          className={`inline-flex items-center justify-center h-4.5 px-1.5 rounded text-[9px] font-semibold ${
                            row.slot === 'AM' ? 'bg-amber-100 text-amber-800' : row.slot === 'PM' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {row.slot}
                        </span>
                      </div>
                      {row.allPlans.length > 1 && (
                        <div className="mt-1 text-[9px] font-bold text-orange-600 bg-orange-50 rounded px-1 py-0.5 border border-orange-200">
                          {row.allPlans.length} plans this month
                        </div>
                      )}
                    </td>

                    {/* Day Cells (1 to 31) */}
                    {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                      const cell = row.days[day];
                      const isToday = isCurrentMonth && day === currentDayNum;

                      if (!cell) {
                        return (
                          <td
                            key={day}
                            className={`px-1 py-1 text-center border-r select-none ${
                              isToday
                                ? 'bg-emerald-50/50 border-x-2 border-emerald-400 text-slate-300'
                                : 'border-slate-200 text-slate-300'
                            }`}
                          >
                            —
                          </td>
                        );
                      }

                      const isDelivered = cell.status === 'DELIVERED';
                      const isSkipped = cell.status === 'SKIPPED';
                      const hasExtra = !!cell.extraMilk;
                      const hasCash = cell.cashCollectedPaise > 0;
                      const hasPlanChange = !!cell.planLabel;

                      return (
                        <td
                          key={day}
                          onClick={() => setSelectedCell({ row, day, cell })}
                          className={`min-w-[58px] max-w-[58px] px-1 py-1 text-center border-r cursor-pointer transition-all hover:ring-2 hover:ring-emerald-400 select-none ${
                            isToday
                              ? 'border-x-2 border-emerald-500/80 bg-emerald-50/90 hover:bg-emerald-100/90 ring-1 ring-inset ring-emerald-300'
                              : hasPlanChange
                              ? 'bg-orange-50/50 hover:bg-orange-100/60 border-slate-200'
                              : isDelivered
                              ? 'bg-emerald-50/40 hover:bg-emerald-100/60 border-slate-200'
                              : isSkipped
                              ? 'bg-red-50/40 hover:bg-red-100/50 border-slate-200'
                              : 'border-slate-200 hover:bg-slate-100'
                          }`}
                          title={`Day ${day}: ${cell.status}${hasPlanChange ? ` (Plan: ${cell.planLabel})` : ''}${hasExtra ? ` (${cell.extraMilk})` : ''}\nClick to change or add extra milk`}
                        >
                          <div className="flex flex-col items-center justify-center min-h-[38px] leading-tight">
                            {/* Plan change indicator */}
                            {hasPlanChange && (
                              <span className="text-[8px] font-semibold text-orange-700 bg-orange-100 rounded px-1 mb-0.5 border border-orange-200 leading-tight">
                                {cell.planLabel}
                              </span>
                            )}

                            {/* Delivery Status Badge */}
                            {isDelivered ? (
                              <span className="inline-flex items-center justify-center gap-0.5 rounded-md bg-emerald-600 px-1 py-0.5 text-[10px] font-semibold text-white shadow-2xs">
                                <Check className="h-3 w-3 stroke-[3]" />
                                {cell.baseQuantity}
                              </span>
                            ) : isSkipped ? (
                              <span className="text-[9px] font-semibold text-red-600 uppercase bg-red-100/80 px-1 rounded line-through">
                                Skip
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-500">
                                {cell.baseQuantity}
                              </span>
                            )}

                            {/* Extra Milk Badge */}
                            {hasExtra && (
                              <span className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] font-semibold text-amber-800 bg-amber-100 rounded px-1 border border-amber-200">
                                +{cell.extraMilk}
                              </span>
                            )}

                            {/* Payment Badge */}
                            {hasCash ? (
                              <span
                                className={`mt-0.5 text-[8px] font-semibold rounded px-1 ${
                                  cell.paymentMode === 'PHONE_PE' ? 'bg-purple-100 text-purple-800' : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                ₹{(cell.cashCollectedPaise / 100).toFixed(0)}
                              </span>
                            ) : cell.cashDuePaise > 0 ? (
                              <span className="mt-0.5 text-[8px] font-semibold text-red-600 bg-red-50 rounded px-1">
                                Due
                              </span>
                            ) : null}

                            {/* Assigned Rider Badge */}
                            {cell.assignedRider && (
                              <span
                                className="mt-0.5 inline-flex items-center gap-0.5 text-[7px] font-bold text-purple-700 bg-purple-100 rounded px-1"
                                title={`Rider: ${cell.assignedRider.name}`}
                              >
                                <Truck className="h-2 w-2" /> {cell.assignedRider.name.slice(0, 5)}
                              </span>
                            )}

                            {/* Photo Proof Badge */}
                            {cell.photoProof && (
                              <span
                                className="mt-0.5 inline-flex items-center gap-0.5 text-[7px] font-bold text-teal-700 bg-teal-100 rounded px-1"
                                title="Photo proof captured"
                              >
                                <Camera className="h-2 w-2" /> Proof
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Totals Columns */}
                    <td className="px-2 py-2 text-center font-semibold text-slate-800 border-r border-slate-200">
                      {row.totalLiters}L
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-emerald-700 border-r border-slate-200">
                      ₹{(row.totalCollectedPaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold text-red-600 border-r border-slate-200">
                      {row.totalDuePaise > 0 ? `₹${(row.totalDuePaise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}
                    </td>

                    {/* WhatsApp Statement Action */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => openStatement(row.subscriptionId)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        title="Generate Monthly Bill Statement"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Daily Totals Footer */}
              <tfoot className="sticky bottom-0 z-20 bg-slate-900 text-white font-semibold text-xs ">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-900 px-1 py-2.5 text-center border-r border-slate-800">Σ</td>
                  <td className="sticky left-10 z-30 bg-slate-900 px-3 py-2.5 uppercase tracking-wide text-[10px] font-semibold text-white border-r border-slate-700 shadow-xs">
                    Daily Total Liters
                  </td>
                  <td className="sticky left-[calc(2.5rem+13rem)] z-30 bg-slate-900 px-3 py-2.5 border-r-2 border-slate-700 shadow-xs" />

                  {Array.from({ length: gridData.daysInMonth }, (_, i) => i + 1).map((day) => {
                    const dt = gridData.dailyTotals[day];
                    const isToday = isCurrentMonth && day === currentDayNum;

                    return (
                      <td
                        key={day}
                        className={`px-1 py-2 text-center border-r ${
                          isToday
                            ? 'bg-emerald-600 text-white font-semibold ring-2 ring-inset ring-emerald-400 text-xs shadow-md'
                            : 'border-slate-800 text-slate-200 font-bold text-[10px] font-mono'
                        }`}
                      >
                        {dt && dt.totalLiters > 0 ? `${dt.totalLiters}L` : '—'}
                      </td>
                    );
                  })}

                  <td className="px-2 py-2.5 text-center border-r border-slate-800 text-amber-300">
                    {filteredRows.reduce((sum, r) => sum + r.totalLiters, 0)}L
                  </td>
                  <td className="px-2 py-2.5 text-right border-r border-slate-800 text-emerald-400">
                    ₹{(filteredRows.reduce((sum, r) => sum + r.totalCollectedPaise, 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-2 py-2.5 text-right border-r border-slate-800 text-red-400">
                    ₹{(filteredRows.reduce((sum, r) => sum + r.totalDuePaise, 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Cell Quick-Action Popover / Modal */}
      {selectedCell && (() => {
        const activeProd = catalogProducts.find((p) => p.id === selectedProductId);
        const effectiveName = activeProd ? activeProd.name : customProductName;
        const effectiveUnitPrice = activeProd ? activeProd.price : Math.max(0, Number(customUnitPrice || 0));

        const presets = getAddonPresets(addonUnitMode, activeProd);
        const matchedPreset = presets.find((pr) => pr.qtyLabel === selectedPresetLabel) || presets[0];

        let multiplier = 1.0;
        let displayQty = '';

        if (addonUnitMode === 'custom') {
          displayQty = customQtyText || '1 Unit';
          multiplier = Math.max(0.01, Number(customQtyMultiplier || 1.0));
        } else if (matchedPreset) {
          displayQty = matchedPreset.qtyLabel;
          multiplier = matchedPreset.multiplier;
        } else {
          displayQty = '1 Unit';
          multiplier = 1.0;
        }

        // Keep the calculation in paise until the end: rounding to whole rupees
        // first charged ₹81.00 for an ₹80.50 product.
        const perDayPaise = Math.round(effectiveUnitPrice * multiplier * 100);
        const extraLabel = `+${displayQty} ${effectiveName}`;
        const totalEveningExtraPrice = Math.round(perDayPaise * consecutiveDays) / 100;
        const totalDuePaise = selectedCell.row.totalDuePaise ?? 0;
        // Presets must collect the exact outstanding balance; rounding to whole
        // rupees left the backend short of the recorded due by up to ₹0.99.
        const customerDueRupees = Math.max(0, totalDuePaise / 100);

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 -xs p-3 sm:p-4 overflow-y-auto"
            onClick={() => setSelectedCell(null)}
          >
            <div
              className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl bg-white  border border-slate-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 1. STICKY HEADER */}
              <div className="sticky top-0 z-20 flex items-start justify-between border-b border-slate-100 bg-white px-5 py-3.5 shadow-xs shrink-0">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Day {selectedCell.day} · {monthLabel}
                    </span>
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                        selectedCell.cell?.status === 'DELIVERED'
                          ? 'bg-emerald-600 text-white'
                          : selectedCell.cell?.status === 'SKIPPED'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {selectedCell.cell?.status || 'SCHEDULED'}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {selectedCell.cell?.deliverySlot === 'PM' ? (
                        <Moon className="h-3 w-3 text-indigo-600" />
                      ) : (
                        <Sun className="h-3 w-3 text-amber-600" />
                      )}
                      {selectedCell.cell?.deliverySlot || selectedCell.row.slot} Shift
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{selectedCell.row.customer.name}</h3>
                  <p className="max-w-sm truncate text-xs font-medium text-slate-500">
                    {selectedCell.row.customer.address} · {selectedCell.row.plan.name} ({selectedCell.cell?.baseQuantity || selectedCell.row.plan.dailyQuantity})
                  </p>
                </div>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                  title="Close (Esc)"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* 2. COMPACT SEGMENTED TABS */}
              <div className="flex border-b border-slate-100 bg-slate-50/80 px-4 pt-2 text-xs font-semibold shrink-0">
                <button
                  type="button"
                  onClick={() => setModalTab('actions')}
                  className={`pb-2 px-3 border-b-2 transition-all ${
                    modalTab === 'actions'
                      ? 'border-emerald-600 text-emerald-800 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Quick Status
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('extra')}
                  className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1 ${
                    modalTab === 'extra'
                      ? 'border-indigo-600 text-indigo-800 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Moon className="h-3 w-3 text-indigo-500" /> Extra / Shift Add-on
                </button>
                <button
                  type="button"
                  onClick={() => setModalTab('payment')}
                  className={`pb-2 px-3 border-b-2 transition-all flex items-center gap-1 ${
                    modalTab === 'payment'
                      ? 'border-emerald-600 text-emerald-800 font-semibold'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Payment & Renew
                  {selectedCell.row.totalDuePaise > 0 && (
                    <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.2 text-[9px] font-semibold text-rose-700">
                      ₹{customerDueRupees} Due
                    </span>
                  )}
                </button>
              </div>

              {/* 3. SCROLLABLE BODY */}
              <div className="overflow-y-auto px-5 py-4 space-y-3.5 flex-1">
                {selectedCell.cell ? (
                  <>
                    {/* TAB 1: QUICK STATUS */}
                    {modalTab === 'actions' && (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Delivery Status</p>
                              <div className="mt-0.5 flex items-center gap-2">
                                <span className="text-sm font-semibold text-slate-900">
                                  {selectedCell.cell.status === 'DELIVERED' ? 'Marked as Delivered' : 'Scheduled for Delivery'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                Base: <span className="font-bold text-slate-700">{selectedCell.cell.baseQuantity}</span>
                                {selectedCell.cell.extraMilk ? (
                                  <span className="ml-1.5 font-bold text-amber-700">({selectedCell.cell.extraMilk})</span>
                                ) : null}
                              </p>
                            </div>
                            <button
                              disabled={actionLoading}
                              onClick={() => handleQuickAction(selectedCell.cell!.deliveryId, 'TOGGLE_DELIVERED')}
                              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-transform active:scale-95 ${
                                selectedCell.cell.status === 'DELIVERED'
                                  ? 'bg-amber-600 hover:bg-amber-700'
                                  : 'bg-emerald-700 hover:bg-emerald-800'
                              }`}
                            >
                              {selectedCell.cell.status === 'DELIVERED' ? 'Undo Delivery (Scheduled)' : 'Mark Delivered ✓'}
                            </button>
                          </div>
                        </div>

                        {/* Shift and Skip Actions */}
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            disabled={actionLoading}
                            onClick={() => handleQuickAction(selectedCell.cell!.deliveryId, 'TOGGLE_SLOT')}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                          >
                            {selectedCell.cell.deliverySlot === 'AM' ? (
                              <>
                                <Moon className="h-4 w-4 text-indigo-600" /> Shift to PM Shift
                              </>
                            ) : (
                              <>
                                <Sun className="h-4 w-4 text-amber-600" /> Shift to AM Shift
                              </>
                            )}
                          </button>

                          <button
                            disabled={actionLoading}
                            onClick={() =>
                              handleQuickAction(selectedCell.cell!.deliveryId, 'SKIP', {
                                note: 'Customer requested skip / not taken',
                              })
                            }
                            className="rounded-xl border border-rose-200 bg-rose-50/70 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 shadow-xs"
                          >
                            Mark Skipped (Not Taken)
                          </button>
                        </div>

                        {/* Default Rider indicator if assigned */}
                        {selectedCell.row.defaultRider && (
                          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-2.5 flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5 font-semibold text-indigo-950">
                              <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                              Pre-Assigned Default Rider:
                            </span>
                            <span className="font-bold text-indigo-900">{selectedCell.row.defaultRider.name}</span>
                          </div>
                        )}

                        {/* Assigned Rider Section */}
                        {selectedCell.cell.assignedRider ? (
                          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center text-purple-700">
                                  <Truck className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-purple-900">
                                    Assigned Rider: {selectedCell.cell.assignedRider.name}
                                  </p>
                                  <p className="text-[10px] text-purple-600">{selectedCell.cell.assignedRider.phone}</p>
                                </div>
                              </div>
                              {selectedCell.cell.status !== 'DELIVERED' && (
                                <button
                                  disabled={actionLoading}
                                  onClick={() => {
                                    setSelectedDeliveryIds([selectedCell.cell!.deliveryId]);
                                    setDispatchRiderModalOpen(true);
                                  }}
                                  className="rounded-lg border border-purple-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-purple-800 hover:bg-purple-50 transition-colors shadow-2xs"
                                >
                                  Reassign
                                </button>
                              )}
                            </div>
                            {selectedCell.cell.status !== 'DELIVERED' && !selectedCell.row.defaultRider && (
                              <button
                                type="button"
                                disabled={actionLoading}
                                onClick={async () => {
                                  if (!selectedCell.cell?.assignedRider?.id) return;
                                  setActionLoading(true);
                                  try {
                                    await apiClient.post(`/store/subscriptions/${selectedCell.row.subscriptionId}/default-rider`, {
                                      riderProfileId: selectedCell.cell.assignedRider.id,
                                    });
                                    toast.success(`Set ${selectedCell.cell.assignedRider.name} as permanent default rider!`);
                                    await loadGrid();
                                  } catch (err: any) {
                                    toast.error(err?.response?.data?.message || 'Failed to set default rider');
                                  } finally {
                                    setActionLoading(false);
                                  }
                                }}
                                className="w-full text-center py-1 text-[10px] font-semibold text-purple-700 hover:underline border-t border-purple-200/60 pt-1.5"
                              >
                                Set {selectedCell.cell.assignedRider.name} as permanent default rider for this customer
                              </button>
                            )}
                          </div>
                        ) : selectedCell.cell.status !== 'DELIVERED' ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2 shadow-2xs">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              Delegate Stop to Rider
                            </p>
                            <div className="flex items-center gap-2">
                              <select
                                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-purple-500"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    void handleAssignSingleRider(selectedCell.cell!.deliveryId, e.target.value, cellDefaultRiderChecked);
                                  }
                                }}
                                defaultValue=""
                                disabled={actionLoading}
                              >
                                <option value="" disabled>Select rider to assign...</option>
                                {availableRiders.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.name} ({r.phone}) · {r.pendingRunCount} active run(s)
                                  </option>
                                ))}
                              </select>
                            </div>
                            <label className="flex items-center gap-2 pt-0.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={cellDefaultRiderChecked}
                                onChange={(e) => setCellDefaultRiderChecked(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                              />
                              <span>Set as permanent default rider for {selectedCell.row.customer.name}</span>
                            </label>
                          </div>
                        ) : null}

                        {/* Photo Proof Section */}
                        {selectedCell.cell.photoProof && (
                          <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 flex items-center justify-between shadow-2xs">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700">
                                <Camera className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-teal-900">Proof of Delivery Captured</p>
                                <p className="text-[10px] text-teal-600">
                                  GPS: {selectedCell.cell.photoProof.gpsLat?.toFixed(4)}, {selectedCell.cell.photoProof.gpsLng?.toFixed(4)} (±{selectedCell.cell.photoProof.accuracyMetres || 0}m)
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => openPhotoProof(selectedCell.cell!.photoProof)}
                              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition-colors"
                            >
                              <Camera className="h-3.5 w-3.5" />
                              View Proof
                            </button>
                          </div>
                        )}

                        {/* Quick Ledger Snapshot */}
                        <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs">
                          <div className="flex items-center justify-between text-slate-500 font-semibold">
                            <span>Paid in Month:</span>
                            <span className="font-bold text-emerald-700">₹{(selectedCell.row.totalCollectedPaise / 100).toFixed(2)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-slate-500 font-semibold">
                            <span>Current Outstanding Due:</span>
                            <span className="font-bold text-rose-700">₹{(selectedCell.row.totalDuePaise / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: EXTRA MILK / PRODUCE / BOWL ADD-ON */}
                    {modalTab === 'extra' && (
                      <div className="space-y-3.5">
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                          {/* Dynamic Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 font-semibold text-xs">
                              {addonUnitMode === 'weight' ? (
                                <>
                                  <Scale className="h-4 w-4 text-emerald-600" />
                                  <span className="text-emerald-950">Fresh Produce & Weight-based Add-on</span>
                                </>
                              ) : addonUnitMode === 'count' ? (
                                <>
                                  <Package className="h-4 w-4 text-amber-600" />
                                  <span className="text-amber-950">Fruit Bowls & Packaged Add-on</span>
                                </>
                              ) : addonUnitMode === 'volume' ? (
                                <>
                                  <Milk className="h-4 w-4 text-indigo-600" />
                                  <span className="text-indigo-950">Fresh Dairy & Liquid Add-on</span>
                                </>
                              ) : (
                                <>
                                  <Zap className="h-4 w-4 text-purple-600" />
                                  <span className="text-purple-950">Custom Store Product Add-on</span>
                                </>
                              )}
                            </div>
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                                extraTargetSlot === 'PM'
                                  ? 'bg-indigo-100 text-indigo-900'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {extraTargetSlot} Shift
                            </span>
                          </div>

                          <p className="text-xs text-slate-600">
                            {addonUnitMode === 'weight'
                              ? 'Select portion in grams or kilograms for fresh fruits, vegetables, and weight items.'
                              : addonUnitMode === 'count'
                              ? 'Select fruit bowls, salads, or meal packs with portion weights and quantities.'
                              : addonUnitMode === 'volume'
                              ? 'Select dairy milk, curd, or liquid beverages measured in liters & milliliters.'
                              : 'Enter customized item quantity, weight specifications, and unit price.'}
                          </p>

                          <div className="space-y-2.5">
                            {/* Product selection */}
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700">Catalog Product</label>
                              <select
                                value={selectedProductId}
                                onChange={(e) => {
                                  const id = e.target.value;
                                  setSelectedProductId(id);
                                  const match = catalogProducts.find((p) => p.id === id);
                                  if (match) {
                                    setCustomUnitPrice(String(match.price));
                                    setCustomProductName(match.name);
                                    const mode = detectProductUnitType(match);
                                    setAddonUnitMode(mode);
                                    const modePresets = getAddonPresets(mode, match);
                                    const defaultPreset =
                                      modePresets[mode === 'weight' ? 1 : mode === 'volume' ? 2 : 0] || modePresets[0];
                                    if (defaultPreset) {
                                      setSelectedPresetLabel(defaultPreset.qtyLabel);
                                    }
                                  }
                                }}
                                className="mt-1 h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                {catalogProducts.length > 0 && (
                                  <optgroup label="Store Products">
                                    {catalogProducts.map((p) => {
                                      const wtText = p.weightGrams ? `${p.weightGrams}g` : p.unit || '';
                                      return (
                                        <option key={p.id} value={p.id}>
                                          {p.name} — ₹{p.price}
                                          {wtText ? ` (${wtText})` : ''}
                                        </option>
                                      );
                                    })}
                                  </optgroup>
                                )}
                                <option value="custom">Custom Product / Manual Rate</option>
                              </select>
                            </div>

                            {/* Measurement / Unit Mode Tabs */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                                Unit Measurement Mode
                              </label>
                              <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1 text-[11px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddonUnitMode('weight');
                                    const pList = getAddonPresets('weight', activeProd);
                                    setSelectedPresetLabel(pList[1]?.qtyLabel || '500g');
                                  }}
                                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition-all text-[11px] ${
                                    addonUnitMode === 'weight'
                                      ? 'bg-white text-emerald-800 shadow-xs font-semibold'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Scale className="h-3 w-3 text-emerald-600" /> Grams / Kg
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddonUnitMode('count');
                                    const pList = getAddonPresets('count', activeProd);
                                    setSelectedPresetLabel(pList[0]?.qtyLabel || '1 Unit');
                                  }}
                                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition-all text-[11px] ${
                                    addonUnitMode === 'count'
                                      ? 'bg-white text-amber-800 shadow-xs font-semibold'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Package className="h-3 w-3 text-amber-600" /> Bowls / Pk
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddonUnitMode('volume');
                                    const pList = getAddonPresets('volume', activeProd);
                                    setSelectedPresetLabel(pList[2]?.qtyLabel || '1L');
                                  }}
                                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition-all text-[11px] ${
                                    addonUnitMode === 'volume'
                                      ? 'bg-white text-indigo-800 shadow-xs font-semibold'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Milk className="h-3 w-3 text-indigo-600" /> Liters / ml
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddonUnitMode('custom');
                                  }}
                                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 transition-all text-[11px] ${
                                    addonUnitMode === 'custom'
                                      ? 'bg-white text-purple-800 shadow-xs font-semibold'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  <Zap className="h-3 w-3 text-purple-600" /> Custom
                                </button>
                              </div>
                            </div>

                            {/* Custom Name & Unit Price if selected */}
                            {selectedProductId === 'custom' && (
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600">Product Name</label>
                                  <input
                                    type="text"
                                    value={customProductName}
                                    onChange={(e) => setCustomProductName(e.target.value)}
                                    placeholder="e.g. Mixed Fruit Bowl"
                                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600">Unit Price (₹)</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={customUnitPrice}
                                    onChange={(e) => setCustomUnitPrice(e.target.value)}
                                    placeholder="80"
                                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none"
                                  />
                                </div>
                              </div>
                            )}

                            {/* Quantity selection based on unit mode */}
                            <div className="pt-1">
                              {addonUnitMode === 'custom' ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600">
                                      Custom Portion / Qty Label
                                    </label>
                                    <input
                                      type="text"
                                      value={customQtyText}
                                      onChange={(e) => setCustomQtyText(e.target.value)}
                                      placeholder="e.g. 350g Bowl / 6 Pcs"
                                      className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600">
                                      Price Multiplier (x)
                                    </label>
                                    <input
                                      type="number"
                                      step="0.05"
                                      min="0.1"
                                      value={customQtyMultiplier}
                                      onChange={(e) => setCustomQtyMultiplier(e.target.value)}
                                      placeholder="1.0"
                                      className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-900 outline-none"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-600">
                                    {addonUnitMode === 'weight'
                                      ? 'Portion Weight (Grams / Kg)'
                                      : addonUnitMode === 'count'
                                      ? 'Quantity / Bowls with Weight'
                                      : 'Portion Volume (Liters)'}
                                  </label>
                                  <select
                                    value={selectedPresetLabel}
                                    onChange={(e) => setSelectedPresetLabel(e.target.value)}
                                    className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                                  >
                                    {presets.map((pr) => (
                                      <option key={pr.qtyLabel} value={pr.qtyLabel}>
                                        {pr.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>

                            {/* Duration & Shift Target */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600">Consecutive Days</label>
                                <select
                                  value={consecutiveDays}
                                  onChange={(e) => setConsecutiveDays(Number(e.target.value))}
                                  className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                                >
                                  <option value={1}>1 Day (Single)</option>
                                  <option value={2}>2 Days</option>
                                  <option value={3}>3 Days</option>
                                  <option value={4}>4 Days</option>
                                  <option value={5}>5 Days</option>
                                  <option value={7}>7 Days (1 Wk)</option>
                                  <option value={10}>10 Days</option>
                                  <option value={15}>15 Days</option>
                                  <option value={30}>30 Days (Full)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold text-slate-600">Shift Target</label>
                                <select
                                  value={extraTargetSlot}
                                  onChange={(e) => setExtraTargetSlot(e.target.value as any)}
                                  className="mt-0.5 h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-900"
                                >
                                  <option value="PM">PM Shift (Evening)</option>
                                  <option value="AM">AM Shift (Morning)</option>
                                </select>
                              </div>
                            </div>

                            {/* Live Calculation summary preview */}
                            <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs flex items-center justify-between font-medium text-slate-600">
                              <span>
                                Adding: <strong className="text-slate-900">{extraLabel}</strong>
                              </span>
                              <span className="font-bold text-slate-900">
                                ₹{perDayPaise / 100}/day
                                {consecutiveDays > 1 && (
                                  <span className="text-emerald-700 ml-1">(Total: ₹{totalEveningExtraPrice})</span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="pt-2 space-y-2">
                            <button
                              disabled={actionLoading}
                              onClick={() => {
                                handleQuickAction(selectedCell.cell!.deliveryId, 'ATTACH_EVENING_MILK', {
                                  extraQuantity: extraLabel,
                                  extraPaise: perDayPaise,
                                  consecutiveDays,
                                  targetSlot: extraTargetSlot,
                                  note: `Customer requested ${consecutiveDays} days ${extraLabel} (${extraTargetSlot})`,
                                });
                              }}
                              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 py-2.5 text-xs font-semibold text-white  hover:bg-indigo-800 transition active:scale-[0.98]"
                            >
                              <Zap className="h-3.5 w-3.5" />
                              Attach {consecutiveDays} Days {extraTargetSlot} Delivery (₹{totalEveningExtraPrice})
                            </button>

                            <button
                              disabled={actionLoading}
                              onClick={() => {
                                handleQuickAction(selectedCell.cell!.deliveryId, 'EXTRA_MILK', {
                                  extraQuantity: extraLabel,
                                  extraPaise: perDayPaise,
                                  amountPaise: perDayPaise,
                                  note: `One-time extra ${extraLabel}`,
                                });
                              }}
                              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-500 py-2 text-xs font-semibold text-white hover:bg-amber-600 transition shadow-xs"
                            >
                              Add as Single Day Extra Today Only (₹{perDayPaise / 100})
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: PAYMENT & RENEW */}
                    {modalTab === 'payment' && (
                      <div className="space-y-3">
                        {/* Daily / Due Payment */}
                        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold text-slate-800">Record Subscriber Payment</p>
                            <span className="text-xs font-bold text-slate-500">
                              Current Due: <strong className="text-rose-700">₹{(selectedCell.row.totalDuePaise / 100).toFixed(2)}</strong>
                            </span>
                          </div>

                          {/* Quick presets */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {customerDueRupees > 0 && (
                              <button
                                type="button"
                                onClick={() => setPaymentAmount(String(customerDueRupees))}
                                className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                              >
                                Full Due (₹{customerDueRupees})
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPaymentAmount('80')}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                            >
                              ₹80
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentAmount('160')}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                            >
                              ₹160
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentAmount('500')}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                            >
                              ₹500
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentAmount('1000')}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                            >
                              ₹1,000
                            </button>
                          </div>

                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              placeholder="Amount ₹"
                              className="w-28 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            />
                            <select
                              value={paymentMode}
                              onChange={(e) => setPaymentMode(e.target.value as any)}
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold outline-none"
                            >
                              <option value="CASH">Cash in Hand</option>
                              <option value="PHONE_PE">PhonePe / UPI</option>
                            </select>
                            <button
                              disabled={actionLoading || !paymentAmount}
                              onClick={() =>
                                handleQuickAction(selectedCell.cell!.deliveryId, 'RECORD_PAYMENT', {
                                  amountPaise: Math.round(Number(paymentAmount || 0) * 100),
                                  paymentMode,
                                })
                              }
                              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        </div>

                        {/* Renew Plan Section */}
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold text-emerald-950">Next Cycle Subscription</p>
                            <p className="text-[11px] text-emerald-700">Extend 30 daily deliveries on the same plan.</p>
                          </div>
                          <button
                            disabled={actionLoading}
                            onClick={async () => {
                              try {
                                setActionLoading(true);
                                await apiClient.post(
                                  `/store/subscriptions/subscribers/${selectedCell.row.subscriptionId}/renew`,
                                  {
                                    isSamePlan: true,
                                    totalDeliveries: 30,
                                  },
                                );
                                toast.success(`Plan renewed for ${selectedCell.row.customer.name}!`);
                                setSelectedCell(null);
                                void loadGrid();
                              } catch (err: any) {
                                toast.error(err.response?.data?.message || 'Renewal failed');
                              } finally {
                                setActionLoading(false);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-800 shadow-xs"
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Renew 30 Days
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-500 py-6 text-center">No scheduled delivery record for this date.</p>
                )}
              </div>

              {/* 4. STICKY FOOTER */}
              <div className="sticky bottom-0 z-20 flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3 shadow-xs shrink-0">
                <span className="text-[11px] font-medium text-slate-400">
                  Press <kbd className="rounded bg-slate-100 px-1 py-0.5 text-[10px] font-bold text-slate-600">Esc</kbd> or click outside
                </span>
                <button
                  onClick={() => setSelectedCell(null)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Morning Pack Summary Modal */}
      {dispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 -xs p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-6  border border-slate-200 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-amber-600" />
                <h3 className="text-base font-semibold text-slate-900">Morning Packing & Dispatch Sheet</h3>
              </div>
              <button onClick={() => setDispatchModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {dispatchLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
                <p className="mt-2 text-xs font-bold text-slate-600">Calculating today's milk procurement demand...</p>
              </div>
            ) : dispatchData ? (
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Metric Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Buffalo Milk (BM)</p>
                    <p className="text-2xl font-semibold text-slate-900">{dispatchData.summary.totalBuffaloMilkLiters} L</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-slate-500">Cow Milk (CM)</p>
                    <p className="text-2xl font-semibold text-slate-900">{dispatchData.summary.totalCowMilkLiters} L</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                    <p className="text-[10px] font-semibold uppercase text-emerald-700">Total Pack Liters</p>
                    <p className="text-2xl font-semibold text-emerald-800">{dispatchData.summary.totalMilkLiters} L</p>
                  </div>
                </div>

                {/* Stops Checklist */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700 flex justify-between">
                    <span>Route Delivery Stops ({dispatchData.summary.totalStops})</span>
                    <span>Completed: {dispatchData.summary.completedStops}</span>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                    {dispatchData.stops.map((stop: any) => (
                      <div key={stop.deliveryId} className="flex items-center justify-between p-2.5 text-xs hover:bg-slate-50">
                        <div>
                          <p className="font-semibold text-slate-900">
                            #{stop.stopNumber} · {stop.customerName}
                          </p>
                          <p className="text-[10px] text-slate-500">{stop.address} · {stop.phone}</p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                            {stop.product} {stop.extra ? `(${stop.extra})` : ''}
                          </span>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">{stop.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setDispatchModalOpen(false)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer WhatsApp Statement Modal */}
      {statementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 -xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6  border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-emerald-600" />
                <h3 className="text-base font-semibold text-slate-900">Monthly Bill Statement</h3>
              </div>
              <button onClick={() => setStatementModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {statementLoading ? (
              <div className="flex flex-col items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <p className="mt-2 text-xs text-slate-500">Generating itemized customer bill...</p>
              </div>
            ) : statementData ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 p-3 space-y-1 text-xs">
                  <p><span className="font-bold text-slate-500">Customer:</span> <span className="font-semibold text-slate-900">{statementData.customerName}</span></p>
                  <p><span className="font-bold text-slate-500">Plan:</span> <span className="font-bold text-slate-700">{statementData.planName}</span></p>
                  <p><span className="font-bold text-slate-500">Deliveries:</span> <span className="font-bold text-emerald-700">{statementData.completedCount} Delivered</span> · {statementData.skippedCount} Skipped</p>
                  {statementData.extraLiters > 0 && (
                    <p><span className="font-bold text-slate-500">Extra Milk:</span> <span className="font-semibold text-amber-700">{statementData.extraLiters} Liters</span></p>
                  )}
                  <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between text-sm">
                    <span className="font-bold text-slate-600">Total Paid: ₹{statementData.totalPaidRupees}</span>
                    <span className="font-semibold text-red-600">Balance Due: ₹{statementData.totalDueRupees}</span>
                  </div>
                </div>

                {/* Pre-formatted WhatsApp Message Box */}
                <div className="rounded-xl border border-slate-200 bg-slate-100 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">WhatsApp Preview</p>
                  <pre className="text-[11px] text-slate-700 font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {statementData.whatsappText}
                  </pre>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(statementData.whatsappText);
                      toast.success('Statement copied to clipboard!');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy Text
                  </button>

                  {statementData.whatsappUrl && (
                    <a
                      href={statementData.whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Send className="h-3.5 w-3.5" /> Send on WhatsApp
                    </a>
                  )}
                </div>
              </div>
            ) : null}

            <button
              onClick={() => setStatementModalOpen(false)}
              className="w-full rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bulk Dispatch to Rider Modal */}
      {dispatchRiderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Dispatch Deliveries to Rider</h3>
                  <p className="text-xs text-slate-500">
                    Pre-assign and delegate scheduled deliveries to an active delivery partner ({monthLabel})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDispatchRiderModalOpen(false)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {/* Target Delivery Date Selector */}
              <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-purple-950">
                    Target Delivery Date
                  </label>
                  <span className="text-xs font-bold text-purple-700 bg-white border border-purple-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                    {new Date(
                      Date.UTC(
                        gridData?.year || today.getFullYear(),
                        gridData?.month !== undefined ? gridData.month : today.getMonth(),
                        dispatchTargetDayNum
                      )
                    ).toLocaleDateString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleTargetDayChange(currentDayNum)}
                    className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all border ${
                      dispatchTargetDayNum === currentDayNum
                        ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Today (Day {currentDayNum})
                  </button>
                  {currentDayNum < (gridData?.daysInMonth || 31) && (
                    <button
                      type="button"
                      onClick={() => handleTargetDayChange(currentDayNum + 1)}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all border ${
                        dispatchTargetDayNum === currentDayNum + 1
                          ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Tomorrow (Day {currentDayNum + 1})
                    </button>
                  )}
                  <select
                    value={dispatchTargetDayNum}
                    onChange={(e) => handleTargetDayChange(Number(e.target.value))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-purple-600"
                  >
                    {Array.from({ length: gridData?.daysInMonth || 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        Day {d} {d === currentDayNum ? '(Today)' : d === currentDayNum + 1 ? '(Tomorrow)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {dispatchTargetDayNum > currentDayNum && (
                  <p className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    📅 <strong>Pre-dispatching in advance:</strong> Deliveries will be scheduled and assigned to the rider ahead of time so they can review their run before their shift.
                  </p>
                )}
              </div>

              {/* 1-Click Auto-Dispatch for Customers with Default Rider */}
              {stopsWithDefaultRider.length > 0 && (
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <p className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                      Pre-Assigned Default Riders ({stopsWithDefaultRider.length} orders ready)
                    </p>
                    <p className="text-[11px] text-indigo-700">
                      Instantly dispatch each order to its designated default rider with 1 click.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={autoDispatching}
                    onClick={handleAutoDispatchDefaultRiders}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-800 disabled:opacity-50 active:scale-95 transition-all shrink-0"
                  >
                    {autoDispatching ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Auto-dispatching...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" />
                        <span>⚡ Auto-Dispatch ({stopsWithDefaultRider.length})</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Rider Selector */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Select Delivery Rider
                </label>
                {availableRiders.length === 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between">
                    <span>No active, approved riders found. Please register or activate a rider first.</span>
                    <button
                      type="button"
                      onClick={() => void loadAvailableRiders()}
                      className="ml-2 font-bold underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedRiderId}
                    onChange={(e) => setSelectedRiderId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-semibold text-slate-800 outline-none focus:border-purple-600 focus:bg-white transition-colors"
                  >
                    {availableRiders.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {r.phone} ({r.pendingRunCount} active run{r.pendingRunCount === 1 ? '' : 's'})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filter Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Shift Filter</label>
                  <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
                    {(['ALL', 'AM', 'PM'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBulkDispatchSlot(s)}
                        className={`flex-1 rounded-lg py-1.5 transition-all ${
                          bulkDispatchSlot === s
                            ? 'bg-white text-purple-900 shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {s === 'ALL' ? 'All Slots' : `${s} Shift`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Customer Channel</label>
                  <div className="flex rounded-xl border border-slate-200 p-0.5 bg-slate-50 text-xs font-bold">
                    {(['ALL', 'ONLINE', 'OFFLINE'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setBulkDispatchType(t)}
                        className={`flex-1 rounded-lg py-1.5 transition-all ${
                          bulkDispatchType === t
                            ? 'bg-white text-purple-900 shadow-xs font-bold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {t === 'ALL' ? 'All' : t === 'ONLINE' ? 'Online' : 'Offline'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Delivery Selection List */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">
                    Deliveries for Day {dispatchTargetDayNum} ({dispatchEligibleStops.length} matching)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = dispatchEligibleStops.map((s) => s.cell.deliveryId);
                        setSelectedDeliveryIds(allIds);
                      }}
                      className="text-xs font-bold text-purple-700 hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDeliveryIds([])}
                      className="text-xs font-bold text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 p-2 bg-slate-50/50">
                  {dispatchEligibleStops.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No matching deliveries for Day {dispatchTargetDayNum}.
                    </p>
                  ) : (
                    dispatchEligibleStops.map(({ row, cell }) => {
                      const isSelected = selectedDeliveryIds.includes(cell.deliveryId);
                      return (
                        <label
                          key={cell.deliveryId}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'border-purple-300 bg-purple-50/80 text-purple-950 font-semibold'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDeliveryIds((prev) => [...prev, cell.deliveryId]);
                                } else {
                                  setSelectedDeliveryIds((prev) => prev.filter((id) => id !== cell.deliveryId));
                                }
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                            <div className="truncate">
                              <p className="font-semibold text-slate-900 truncate">{row.customer.name}</p>
                              <p className="text-[11px] text-slate-500 truncate">{row.customer.address}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                row.customer.customerType === 'offline'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {row.customer.customerType === 'offline' ? 'OFFLINE' : 'ONLINE'}
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                              {cell.deliverySlot}
                            </span>
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              {cell.baseQuantity}
                            </span>
                            {cell.cashDuePaise > 0 && (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                ₹{(cell.cashDuePaise / 100).toFixed(0)} COD
                              </span>
                            )}
                            {cell.assignedRider && (
                              <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-bold text-purple-800">
                                Assigned: {cell.assignedRider.name}
                              </span>
                            )}
                            {row.defaultRider && (
                              <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-bold text-indigo-900">
                                Default: {row.defaultRider.name}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Selection Summary */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3 flex flex-wrap items-center justify-between text-xs font-semibold text-purple-900">
                <span>Selected: {selectedDeliveryIds.length} stops</span>
                <span>
                  Estimated Volume:{' '}
                  {dispatchEligibleStops
                    .filter((s) => selectedDeliveryIds.includes(s.cell.deliveryId))
                    .reduce((sum, s) => sum + (parseFloat(s.cell.extraMilk || s.cell.baseQuantity) || 1), 0)}{' '}
                  L
                </span>
                <span>
                  Expected Cash:{' '}
                  ₹
                  {(
                    dispatchEligibleStops
                      .filter((s) => selectedDeliveryIds.includes(s.cell.deliveryId))
                      .reduce((sum, s) => sum + (s.cell.cashDuePaise || 0), 0) / 100
                  ).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 bg-slate-50 shrink-0">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer mr-auto">
                <input
                  type="checkbox"
                  checked={saveAsDefaultRider}
                  onChange={(e) => setSaveAsDefaultRider(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span>Save as permanent default rider for selected customers</span>
              </label>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDispatchRiderModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={riderDispatchSubmitting || selectedDeliveryIds.length === 0 || !selectedRiderId}
                  onClick={handleDispatchToRider}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-purple-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-800 disabled:opacity-50 active:scale-95 transition-all"
                >
                  {riderDispatchSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Dispatching Run...</span>
                    </>
                  ) : (
                    <>
                      <Truck className="h-4 w-4" />
                      <span>Dispatch {selectedDeliveryIds.length} Stops</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Photo & GPS Proof Viewer Modal */}
      {viewingPhotoProof && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
          onClick={() => setViewingPhotoProof(null)}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl bg-white p-5 border border-slate-200 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700">
                  <Camera className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Proof of Delivery</h3>
                  <p className="text-[11px] text-slate-500">Camera photo and GPS coordinates verified on delivery</p>
                </div>
              </div>
              <button
                onClick={() => setViewingPhotoProof(null)}
                className="rounded-xl p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Photo Preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 min-h-60 flex items-center justify-center overflow-hidden">
              {loadingPhotoUrl ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                  <p className="text-xs font-semibold text-slate-600">Loading delivery photograph...</p>
                </div>
              ) : viewingPhotoUrl ? (
                <img
                  src={viewingPhotoUrl}
                  alt="Delivery Proof"
                  className="max-h-80 w-auto rounded-lg object-contain mx-auto shadow-xs"
                />
              ) : (
                <div className="text-center py-10 text-xs text-slate-500">
                  <Camera className="h-8 w-8 mx-auto text-slate-300 mb-1" />
                  <span>Photo preview unavailable</span>
                </div>
              )}
            </div>

            {/* GPS Details & Timestamp */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-500">Captured At:</span>
                <span className="font-bold text-slate-800">
                  {viewingPhotoProof.capturedAt ? new Date(viewingPhotoProof.capturedAt).toLocaleString('en-IN') : '—'}
                </span>
              </div>

              {viewingPhotoProof.gpsLat && viewingPhotoProof.gpsLng ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">GPS Coordinates:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-slate-800">
                      {viewingPhotoProof.gpsLat.toFixed(5)}, {viewingPhotoProof.gpsLng.toFixed(5)}
                    </span>
                    <a
                      href={`https://www.google.com/maps?q=${viewingPhotoProof.gpsLat},${viewingPhotoProof.gpsLng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded bg-teal-50 border border-teal-200 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 hover:bg-teal-100 transition-colors"
                    >
                      <MapPin className="h-3 w-3" /> Maps
                    </a>
                  </div>
                </div>
              ) : null}

              {viewingPhotoProof.accuracyMetres ? (
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-500">GPS Accuracy:</span>
                  <span className="font-bold text-slate-800">±{viewingPhotoProof.accuracyMetres.toFixed(1)} metres</span>
                </div>
              ) : null}

              {viewingPhotoProof.cashCollectedPaise > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5">
                  <span className="font-semibold text-slate-500">Cash Collected:</span>
                  <span className="font-bold text-emerald-700">₹{(viewingPhotoProof.cashCollectedPaise / 100).toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setViewingPhotoProof(null)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  Check,
  DollarSign,
  Edit,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type Category = { id: string; name: string };
type Store = { id: string; name: string; isActive?: boolean; inventory?: Array<{ productId: string; quantity: number }> };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  images?: unknown;
  details?: any;
  isActive?: boolean;
  categoryId: string;
  createdAt?: string;
  category?: Category;
};
type DetailField = { key: string; label: string; multiline?: boolean };
type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  image: string;
  images: string[];
  galleryInput: string;
  isActive: boolean;
  details: Record<string, string>;
};

const DETAIL_SECTIONS: Array<{ title: string; fields: DetailField[] }> = [
  {
    title: 'Highlights',
    fields: [
      { key: 'brand', label: 'Brand' },
      { key: 'productType', label: 'Product type' },
      { key: 'flavour', label: 'Flavour' },
      { key: 'materialTypeFree', label: 'Material type free' },
      { key: 'keyFeatures', label: 'Key features', multiline: true },
      { key: 'itemForm', label: 'Item form' },
      { key: 'ingredients', label: 'Ingredients', multiline: true },
      { key: 'allergenInformation', label: 'Allergen information', multiline: true },
      { key: 'fssaiLicense', label: 'FSSAI license' },
      { key: 'nutritionInformation', label: 'Nutrition information', multiline: true },
      { key: 'dietaryPreference', label: 'Dietary preference' },
      { key: 'spiceLevel', label: 'Spice level' },
      { key: 'cuisineType', label: 'Cuisine type' },
      { key: 'packagingType', label: 'Packaging type' },
      { key: 'storageInstruction', label: 'Storage instruction' },
      { key: 'isPerishable', label: 'Is perishable' },
      { key: 'servingSize', label: 'Serving size' },
      { key: 'weight', label: 'Weight' },
      { key: 'unit', label: 'Unit' },
    ],
  },
  {
    title: 'Information',
    fields: [
      { key: 'disclaimer', label: 'Disclaimer', multiline: true },
      { key: 'customerCareDetails', label: 'Customer care details', multiline: true },
      { key: 'sellerName', label: 'Seller name' },
      { key: 'sellerAddress', label: 'Seller address', multiline: true },
      { key: 'sellerLicenseNo', label: 'Seller license no.' },
      { key: 'manufacturerOrMarketerName', label: 'Manufacturer or marketer name' },
      { key: 'countryOfOrigin', label: 'Country of origin' },
      { key: 'shelfLife', label: 'Shelf life' },
    ],
  },
];
const ALL_DETAIL_FIELDS = DETAIL_SECTIONS.flatMap((section) => section.fields);
const emptyDetails = () => ALL_DETAIL_FIELDS.reduce<Record<string, string>>((acc, field) => ({ ...acc, [field.key]: '' }), {});
const splitImages = (value: unknown) => (Array.isArray(value) ? value : String(value || '').split(/[\n,]+/));
const cleanImages = (...values: unknown[]) => Array.from(new Set(values.flatMap(splitImages).map((item) => String(item || '').trim()).filter(Boolean)));
const toGalleryText = (value: unknown) => cleanImages(value).join('\n');
const emptyForm = (): ProductForm => ({
  name: '',
  description: '',
  price: '',
  categoryId: '',
  image: '',
  images: [],
  galleryInput: '',
  isActive: true,
  details: emptyDetails(),
});

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [savingStock, setSavingStock] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [form, setForm] = useState<ProductForm>(emptyForm());

  const selectedStore = useMemo(() => stores.find((store) => store.id === selectedStoreId), [stores, selectedStoreId]);
  const selectedStoreStock = useMemo(() => new Map((selectedStore?.inventory || []).map((item) => [item.productId, item.quantity])), [selectedStore]);
  const categoryCounts = useMemo(() => products.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.categoryId]: (acc[item.categoryId] || 0) + 1 }), {}), [products]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, storesRes] = await Promise.all([
        apiClient.get('/admin/products'),
        apiClient.get('/products/categories'),
        apiClient.get('/stores'),
      ]);
      const nextStores: Store[] = storesRes.data || [];
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
      setStores(nextStores);
      const preferredStore = nextStores.find((store) => store.isActive !== false) || nextStores[0];
      setSelectedStoreId((prev) => prev || preferredStore?.id || '');
    } catch (err) {
      console.error('Failed to fetch catalog data', err);
      setError('Failed to load catalog data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const product of products) drafts[product.id] = String(selectedStoreStock.get(product.id) ?? 0);
    setStockDrafts(drafts);
  }, [products, selectedStoreStock]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !term || product.name.toLowerCase().includes(term) || product.category?.name?.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'All' || product.category?.name === categoryFilter;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? product.isActive !== false : product.isActive === false);
      return matchesSearch && matchesCategory && matchesStatus;
    }).sort((a, b) => {
      const activeDelta = Number(b.isActive !== false) - Number(a.isActive !== false);
      if (activeDelta !== 0) return activeDelta;
      const aQty = Number(stockDrafts[a.id] ?? selectedStoreStock.get(a.id) ?? 0);
      const bQty = Number(stockDrafts[b.id] ?? selectedStoreStock.get(b.id) ?? 0);
      if ((aQty <= 0) !== (bQty <= 0)) return aQty <= 0 ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [products, searchTerm, categoryFilter, statusFilter, stockDrafts, selectedStoreStock]);

  const openCreateProduct = () => { setEditingProduct(null); setForm(emptyForm()); setError(''); setProductDialogOpen(true); };
  const openEditProduct = (product: Product) => {
    const nextDetails = emptyDetails();
    const saved = product.details && typeof product.details === 'object' ? product.details : {};
    for (const field of ALL_DETAIL_FIELDS) nextDetails[field.key] = String(saved[field.key] || '');
    const allImages = cleanImages(product.image, product.images, saved.galleryImages);
    const mainImage = product.image || allImages[0] || '';
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      categoryId: product.categoryId,
      image: mainImage,
      images: allImages,
      galleryInput: toGalleryText(allImages.filter((url) => url !== mainImage)),
      isActive: product.isActive !== false,
      details: nextDetails,
    });
    setError('');
    setProductDialogOpen(true);
  };
  const closeProductDialog = () => { setProductDialogOpen(false); setEditingProduct(null); setForm(emptyForm()); setError(''); };
  const updateDetail = (key: string, value: string) => setForm((prev) => ({ ...prev, details: { ...prev.details, [key]: value } }));

  const setMainImage = (url: string) => setForm((prev) => ({ ...prev, image: url, images: cleanImages(url, prev.images) }));
  const removeImage = (url: string) => setForm((prev) => {
    const images = prev.images.filter((item) => item !== url);
    return { ...prev, images, image: prev.image === url ? images[0] || '' : prev.image };
  });

  const handleImagesUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const badFile = files.find((file) => !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024);
    if (badFile) return setError('Each image must be JPEG, PNG, WebP, or GIF and under 5MB.');
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      for (const file of files) body.append('files', file);
      const response = await apiClient.post('/upload/images', body);
      const uploadedUrls = cleanImages(response.data?.publicUrls || response.data?.images?.map((item: any) => item.publicUrl) || []);
      if (!uploadedUrls.length) throw new Error('No public URLs returned.');
      setForm((prev) => {
        const images = cleanImages(prev.images, uploadedUrls);
        return { ...prev, images, image: prev.image || images[0] || '' };
      });
      event.target.value = '';
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload images.');
    } finally {
      setUploading(false);
    }
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const images = cleanImages(form.image, form.images, form.galleryInput);
      const mainImage = form.image || images[0] || null;
      const galleryImages = images.filter((url) => url !== mainImage);
      const payloadDetails = { ...form.details, ...(galleryImages.length ? { galleryImages } : { galleryImages: '' }) };
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        categoryId: form.categoryId,
        image: mainImage,
        images,
        isActive: form.isActive,
        details: payloadDetails,
      };
      if (!payload.name || !payload.categoryId || !Number.isFinite(payload.price) || payload.price <= 0) throw new Error('Enter product name, category, and valid price.');
      if (editingProduct) await apiClient.patch(`/products/${editingProduct.id}`, payload);
      else await apiClient.post('/products', payload);
      closeProductDialog();
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleProductVisibility = async (product: Product) => {
    setMessage('');
    setError('');
    try {
      await apiClient.patch(`/admin/products/${product.id}/active`, { isActive: product.isActive === false });
      await fetchData();
      setMessage(product.isActive === false ? 'Product is active and visible to customers.' : 'Product is inactive and hidden from customers.');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update product visibility.');
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    setSubmitting(true);
    setError('');
    try { await apiClient.delete(`/products/${deletingProduct.id}`); setDeletingProduct(null); await fetchData(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete product.'); }
    finally { setSubmitting(false); }
  };

  const openCategoryDialog = () => { setCategoryDialogOpen(true); setEditingCategory(null); setDeletingCategory(null); setCategoryName(''); setError(''); };
  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const name = categoryName.trim().replace(/\s+/g, ' ');
      if (name.length < 2) throw new Error('Category name must be at least 2 characters.');
      if (editingCategory) await apiClient.patch(`/products/categories/${editingCategory.id}`, { name });
      else await apiClient.post('/products/categories', { name });
      setEditingCategory(null);
      setCategoryName('');
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save category.');
    } finally {
      setSubmitting(false);
    }
  };
  const deleteCategory = async () => {
    if (!deletingCategory) return;
    setSubmitting(true);
    setError('');
    try { await apiClient.delete(`/products/categories/${deletingCategory.id}`); setDeletingCategory(null); await fetchData(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Failed to delete category.'); }
    finally { setSubmitting(false); }
  };

  const saveStock = async (productId: string) => {
    if (!selectedStoreId) return setMessage('Select a store before saving inventory.');
    const quantity = Number(stockDrafts[productId] ?? '0');
    if (!Number.isFinite(quantity) || quantity < 0) return setMessage('Stock quantity must be a non-negative number.');
    setSavingStock((prev) => ({ ...prev, [productId]: true }));
    setMessage('');
    try { await apiClient.patch(`/stores/${selectedStoreId}/inventory`, { productId, quantity: Math.floor(quantity) }); await fetchData(); setMessage('Inventory updated.'); }
    catch (err: any) { setMessage(err?.response?.data?.message || 'Failed to update inventory.'); }
    finally { setSavingStock((prev) => ({ ...prev, [productId]: false })); }
  };

  const stats = [
    { label: 'Products', value: products.length, icon: Package, color: 'bg-blue-500' },
    { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-purple-500' },
    { label: 'Active', value: products.filter((product) => product.isActive !== false).length, icon: Eye, color: 'bg-emerald-500' },
    { label: 'Inactive', value: products.filter((product) => product.isActive === false).length, icon: EyeOff, color: 'bg-amber-500' },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">Catalog operations</p>
            <h1 className="mt-3 text-3xl font-black text-gray-950">Product Catalog</h1>
            <p className="text-sm font-semibold text-gray-500">Create products, manage categories, highlights, information, gallery images, visibility, and inventory.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={openCategoryDialog} className="inline-flex items-center rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-black text-teal-800 hover:bg-teal-50"><Tag className="mr-2 h-4 w-4" /> Manage Categories</button>
            <button onClick={openCreateProduct} className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700"><Plus className="mr-2 h-4 w-4" /> Add Product</button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">{stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-gray-500">{stat.label}</p><p className="mt-1 text-2xl font-black text-gray-950">{stat.value}</p></div><div className={`rounded-xl p-3 ${stat.color}`}><stat.icon className="h-5 w-5 text-white" /></div></div></div>)}</div>

        <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search products or categories" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-emerald-500" /></div>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500"><option value="All">All Categories</option>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500"><option value="all">All Status</option><option value="active">Active only</option><option value="inactive">Inactive only</option></select>
              <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500">{stores.length ? stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.isActive === false ? ' (Inactive)' : ''}</option>) : <option value="">No stores</option>}</select>
            </div>
            {message && <p className="mt-3 text-sm font-bold text-emerald-700">{message}</p>}
            {error && !productDialogOpen && !categoryDialogOpen && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-gray-100 bg-gray-50/70"><th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Product</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Category</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Price</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Stock</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Status</th><th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-gray-500">Actions</th></tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-500">Loading catalog...</td></tr> : filteredProducts.length === 0 ? <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-500">No products found.</td></tr> : filteredProducts.map((product) => {
                  const stock = Number(stockDrafts[product.id] ?? selectedStoreStock.get(product.id) ?? 0);
                  const unavailable = stock <= 0;
                  const inactive = product.isActive === false;
                  return <tr key={product.id} className={inactive || unavailable ? 'bg-gray-50/70 text-gray-400' : 'hover:bg-gray-50'}><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100">{product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}</div><div><p className="text-sm font-black text-gray-950">{product.name}</p><p className="max-w-xs truncate text-xs font-semibold text-gray-500">{inactive ? 'Hidden from customers' : product.description || 'No description'}</p></div></div></td><td className="px-6 py-4"><span className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">{product.category?.name || 'Uncategorized'}</span></td><td className="px-6 py-4 text-sm font-black text-gray-950">₹{Number(product.price || 0).toFixed(2)}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><input type="number" min={0} value={stockDrafts[product.id] ?? '0'} onChange={(e) => setStockDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))} className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500" /><button onClick={() => saveStock(product.id)} disabled={!selectedStoreId || savingStock[product.id]} className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">{savingStock[product.id] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save</button></div></td><td className="px-6 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${inactive ? 'bg-amber-100 text-amber-800' : unavailable ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{inactive ? 'Inactive / hidden' : unavailable ? 'Unavailable' : `${stock} in stock`}</span></td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-1.5"><button onClick={() => toggleProductVisibility(product)} className={`rounded-lg p-2 ${inactive ? 'text-emerald-700 hover:bg-emerald-50' : 'text-amber-700 hover:bg-amber-50'}`}>{inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button onClick={() => openEditProduct(product)} className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"><Edit className="h-4 w-4" /></button><button onClick={() => setDeletingProduct(product)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {productDialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-6"><div><h2 className="text-xl font-black text-gray-950">{editingProduct ? 'Edit Product' : 'Add Product'}</h2><p className="text-sm font-semibold text-gray-500">Customers see these details and images after clicking the product.</p></div><button onClick={closeProductDialog} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><form onSubmit={saveProduct} className="space-y-6 p-6">{error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}<div className="grid gap-4 md:grid-cols-2"><label className="block text-sm font-bold text-gray-700">Product name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" /></label><label className="block text-sm font-bold text-gray-700">Price<input required type="number" min="0.01" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" /></label><label className="block text-sm font-bold text-gray-700">Category<select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500"><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700"><span>Visible to customers</span><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-5 w-5 accent-emerald-600" /></label><label className="block text-sm font-bold text-gray-700 md:col-span-2">Product images<div className="mt-1 rounded-2xl border-2 border-dashed border-gray-200 p-4 text-center"><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImagesUpload} disabled={uploading} className="hidden" id="product-image-upload" /><label htmlFor="product-image-upload" className="cursor-pointer">{uploading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" /> : form.image ? <img src={form.image} alt="Product preview" className="mx-auto h-20 w-20 rounded-xl object-cover" /> : <Upload className="mx-auto h-8 w-8 text-gray-400" />}<span className="mt-2 block text-sm font-bold text-gray-500">Upload one or more product images</span></label>{form.image && <p className="mt-2 inline-flex items-center text-sm font-bold text-emerald-700"><Check className="mr-1 h-4 w-4" /> Main image ready</p>}</div></label></div>{form.images.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{form.images.map((url) => <div key={url} className={`rounded-2xl border p-2 ${form.image === url ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}><img src={url} alt="Product gallery" className="h-24 w-full rounded-xl object-cover" /><div className="mt-2 flex gap-1"><button type="button" onClick={() => setMainImage(url)} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-black text-white">Main</button><button type="button" onClick={() => removeImage(url)} className="rounded-lg bg-red-50 px-2 py-1 text-[11px] font-black text-red-700">Remove</button></div></div>)}</div>}<label className="block text-sm font-bold text-gray-700">Extra gallery image URLs<textarea value={form.galleryInput} onChange={(e) => setForm({ ...form, galleryInput: e.target.value })} rows={4} placeholder="Paste one image URL per line. Uploaded images are saved automatically too." className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" /><span className="mt-1 block text-xs font-bold text-gray-400">Use this for external URLs. Uploaded images above and these URLs are saved together as the product gallery.</span></label><label className="block text-sm font-bold text-gray-700">Short description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" /></label>{DETAIL_SECTIONS.map((section) => <section key={section.title} className="rounded-3xl border border-gray-100 bg-gray-50/60 p-5"><h3 className="text-lg font-black text-gray-950">{section.title}</h3><div className="mt-4 grid gap-4 md:grid-cols-2">{section.fields.map((field) => <label key={field.key} className={`${field.multiline ? 'md:col-span-2' : ''} block text-sm font-bold text-gray-700`}>{field.label}{field.multiline ? <textarea value={form.details[field.key] || ''} onChange={(e) => updateDetail(field.key, e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" /> : <input value={form.details[field.key] || ''} onChange={(e) => updateDetail(field.key, e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" />}</label>)}</div></section>)}<div className="sticky bottom-0 -mx-6 flex gap-3 border-t border-gray-100 bg-white p-6"><button type="button" onClick={closeProductDialog} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black text-gray-700 hover:bg-gray-200">Cancel</button><button disabled={submitting} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700 disabled:opacity-50">{submitting ? 'Saving...' : editingProduct ? 'Save Product' : 'Create Product'}</button></div></form></div></div>}

      {categoryDialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-gray-100 p-6"><div><h2 className="text-xl font-black text-gray-950">Manage Categories</h2><p className="text-sm font-semibold text-gray-500">Create, edit, and delete unused categories inside this dialog.</p></div><button onClick={() => setCategoryDialogOpen(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div><div className="grid gap-5 p-6 md:grid-cols-[1fr_1.1fr]"><form onSubmit={saveCategory} className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><h3 className="text-sm font-black uppercase tracking-wider text-gray-500">{editingCategory ? 'Edit category' : 'Create category'}</h3>{error && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}<label className="mt-4 block text-sm font-bold text-gray-700">Category name<input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-teal-500" /></label><div className="mt-4 flex gap-2"><button type="button" onClick={() => { setEditingCategory(null); setCategoryName(''); setError(''); }} className="flex-1 rounded-xl bg-white px-4 py-3 font-black text-gray-700 hover:bg-gray-100">Clear</button><button disabled={submitting} className="flex-1 rounded-xl bg-teal-700 px-4 py-3 font-black text-white hover:bg-teal-800 disabled:opacity-50">{submitting ? 'Saving...' : editingCategory ? 'Save' : 'Create'}</button></div></form><div className="space-y-2"><h3 className="text-sm font-black uppercase tracking-wider text-gray-500">Existing categories</h3>{categories.length === 0 ? <p className="rounded-2xl border border-dashed border-gray-200 p-4 text-sm font-semibold text-gray-500">No categories yet.</p> : categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white px-3 py-3"><div><p className="text-sm font-black text-gray-900">{category.name}</p><p className="text-xs font-bold text-gray-400">{categoryCounts[category.id] || 0} product{categoryCounts[category.id] === 1 ? '' : 's'}</p></div><div className="flex gap-1"><button onClick={() => { setEditingCategory(category); setDeletingCategory(null); setCategoryName(category.name); setError(''); }} className="rounded-lg p-2 text-gray-400 hover:bg-teal-50 hover:text-teal-700"><Edit className="h-4 w-4" /></button><button onClick={() => setDeletingCategory(category)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></div>{deletingCategory && <div className="mx-6 mb-6 rounded-2xl border border-red-100 bg-red-50 p-4"><p className="font-black text-red-800">Delete {deletingCategory.name}?</p><p className="mt-1 text-sm font-semibold text-red-700">This is allowed only when the category has no products.</p><div className="mt-4 flex gap-2"><button onClick={() => setDeletingCategory(null)} className="flex-1 rounded-xl bg-white px-4 py-2.5 font-black text-red-700">Cancel</button><button onClick={deleteCategory} disabled={submitting} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-black text-white disabled:opacity-50">Delete</button></div></div>}</div></div>}

      {deletingProduct && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-3"><div className="rounded-2xl bg-red-50 p-3 text-red-700"><AlertTriangle className="h-6 w-6" /></div><div><h2 className="text-xl font-black text-gray-950">Delete product?</h2><p className="text-sm font-semibold text-gray-500">{deletingProduct.name} will be removed from the catalog. For seasonal products, prefer the visibility button.</p></div></div><div className="mt-6 flex gap-3"><button onClick={() => setDeletingProduct(null)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black text-gray-700 hover:bg-gray-200">Cancel</button><button onClick={deleteProduct} disabled={submitting} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-black text-white hover:bg-red-700 disabled:opacity-50">Delete</button></div></div></div>}
    </DashboardLayout>
  );
}

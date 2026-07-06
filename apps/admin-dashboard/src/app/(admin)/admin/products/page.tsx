'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  Check,
  DollarSign,
  Edit,
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

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  categoryId: string;
  createdAt: string;
  category?: { id: string; name: string };
}

interface Category {
  id: string;
  name: string;
}

interface Store {
  id: string;
  name: string;
  isActive?: boolean;
  inventory?: Array<{ productId: string; quantity: number }>;
}

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  image: string;
};

const emptyProductForm: ProductForm = {
  name: '',
  description: '',
  price: '',
  categoryId: '',
  image: '',
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [savingStock, setSavingStock] = useState<Record<string, boolean>>({});
  const [stockMessage, setStockMessage] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const selectedStore = useMemo(() => stores.find((store) => store.id === selectedStoreId), [stores, selectedStoreId]);
  const selectedStoreStock = useMemo(() => new Map((selectedStore?.inventory || []).map((item) => [item.productId, item.quantity])), [selectedStore]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, storesRes] = await Promise.all([
        apiClient.get('/products'),
        apiClient.get('/products/categories'),
        apiClient.get('/stores'),
      ]);
      const fetchedStores: Store[] = storesRes.data || [];
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : productsRes.data?.items || []);
      setCategories(Array.isArray(categoriesRes.data) ? categoriesRes.data : []);
      setStores(fetchedStores);
      const preferredStore = fetchedStores.find((s) => s.isActive !== false) || fetchedStores[0];
      setSelectedStoreId((prev) => prev || preferredStore?.id || '');
    } catch (err) {
      console.error('Failed to fetch catalog data', err);
      setError('Failed to load catalog data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const nextDrafts: Record<string, string> = {};
    for (const product of products) {
      nextDrafts[product.id] = String(selectedStoreStock.get(product.id) ?? 0);
    }
    setStockDrafts(nextDrafts);
  }, [products, selectedStoreStock]);

  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return products
      .filter((product) => {
        const matchesSearch = !term || product.name.toLowerCase().includes(term) || product.category?.name?.toLowerCase().includes(term);
        const matchesCategory = categoryFilter === 'All' || product.category?.name === categoryFilter;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => {
        const aQty = Number(stockDrafts[a.id] ?? selectedStoreStock.get(a.id) ?? 0);
        const bQty = Number(stockDrafts[b.id] ?? selectedStoreStock.get(b.id) ?? 0);
        const aUnavailable = aQty <= 0;
        const bUnavailable = bQty <= 0;
        if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }, [products, searchTerm, categoryFilter, stockDrafts, selectedStoreStock]);

  const stats = [
    { label: 'Products', value: products.length, icon: Package, color: 'bg-blue-500' },
    { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-purple-500' },
    { label: 'Avg Price', value: `₹${(products.reduce((acc, p) => acc + Number(p.price || 0), 0) / Math.max(products.length, 1)).toFixed(0)}`, icon: DollarSign, color: 'bg-emerald-500' },
    { label: 'Unavailable', value: products.filter((p) => Number(stockDrafts[p.id] ?? selectedStoreStock.get(p.id) ?? 0) <= 0).length, icon: AlertTriangle, color: 'bg-amber-500' },
  ];

  const resetProductForm = () => {
    setProductForm(emptyProductForm);
    setEditingProduct(null);
    setError('');
  };

  const openCreateProduct = () => {
    resetProductForm();
    setShowProductModal(true);
  };

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      categoryId: product.categoryId,
      image: product.image || '',
    });
    setError('');
    setShowProductModal(true);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await apiClient.post('/upload/image', body);
      const publicUrl = response.data?.publicUrl;
      if (!publicUrl) throw new Error('No public URL returned.');
      setProductForm((prev) => ({ ...prev, image: publicUrl }));
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload image.');
    } finally {
      setUploading(false);
    }
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price: Number(productForm.price),
        categoryId: productForm.categoryId,
        image: productForm.image.trim() || null,
      };
      if (!payload.name || !payload.categoryId || !Number.isFinite(payload.price) || payload.price <= 0) {
        throw new Error('Enter product name, category, and valid price.');
      }
      if (editingProduct) {
        await apiClient.patch(`/products/${editingProduct.id}`, payload);
      } else {
        await apiClient.post('/products', payload);
      }
      setShowProductModal(false);
      resetProductForm();
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProduct = async () => {
    if (!deletingProduct) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.delete(`/products/${deletingProduct.id}`);
      setDeletingProduct(null);
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete product.');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCategoryName('');
    setError('');
    setShowCategoryModal(true);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setError('');
    setShowCategoryModal(true);
  };

  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const name = categoryName.trim().replace(/\s+/g, ' ');
      if (name.length < 2) throw new Error('Category name must be at least 2 characters.');
      if (editingCategory) {
        await apiClient.patch(`/products/categories/${editingCategory.id}`, { name });
      } else {
        await apiClient.post('/products/categories', { name });
      }
      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryName('');
      await fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save category.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStockDraft = (productId: string, value: string) => {
    setStockDrafts((prev) => ({ ...prev, [productId]: value }));
  };

  const saveStock = async (productId: string) => {
    if (!selectedStoreId) {
      setStockMessage('Select a store before saving inventory.');
      return;
    }
    const quantity = Number(stockDrafts[productId] ?? '0');
    if (!Number.isFinite(quantity) || quantity < 0) {
      setStockMessage('Stock quantity must be a non-negative number.');
      return;
    }
    setSavingStock((prev) => ({ ...prev, [productId]: true }));
    setStockMessage('');
    try {
      await apiClient.patch(`/stores/${selectedStoreId}/inventory`, { productId, quantity: Math.floor(quantity) });
      await fetchData();
      setStockMessage('Inventory updated. Unavailable products automatically move to the bottom.');
    } catch (err: any) {
      setStockMessage(err?.response?.data?.message || 'Failed to update inventory.');
    } finally {
      setSavingStock((prev) => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6 pb-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">Catalog operations</p>
            <h1 className="mt-3 text-3xl font-black text-gray-950">Product Catalog</h1>
            <p className="text-sm font-semibold text-gray-500">Create products, manage categories, and control store inventory.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={openCreateCategory} className="inline-flex items-center rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-black text-teal-800 hover:bg-teal-50">
              <Tag className="mr-2 h-4 w-4" /> Add Category
            </button>
            <button onClick={openCreateProduct} className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700">
              <Plus className="mr-2 h-4 w-4" /> Add Product
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-black text-gray-950">{stat.value}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.color}`}><stat.icon className="h-5 w-5 text-white" /></div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search products or categories"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500">
                  <option value="All">All Categories</option>
                  {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                </select>
                <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-emerald-500">
                  {stores.length ? stores.map((store) => <option key={store.id} value={store.id}>{store.name}{store.isActive === false ? ' (Inactive)' : ''}</option>) : <option value="">No stores</option>}
                </select>
              </div>
              {stockMessage && <p className="mt-3 text-sm font-bold text-emerald-700">{stockMessage}</p>}
              {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Product</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Category</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Price</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Stock</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-wider text-gray-500">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wider text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-500">Loading catalog...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-500">No products found.</td></tr>
                  ) : filteredProducts.map((product) => {
                    const stock = Number(stockDrafts[product.id] ?? selectedStoreStock.get(product.id) ?? 0);
                    const unavailable = stock <= 0;
                    return (
                      <tr key={product.id} className={unavailable ? 'bg-gray-50/70 text-gray-400' : 'hover:bg-gray-50'}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                              {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-950">{product.name}</p>
                              <p className="max-w-xs truncate text-xs font-semibold text-gray-500">{product.description || 'No description'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4"><span className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">{product.category?.name || 'Uncategorized'}</span></td>
                        <td className="px-6 py-4 text-sm font-black text-gray-950">₹{Number(product.price || 0).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={stockDrafts[product.id] ?? '0'}
                              onChange={(e) => updateStockDraft(product.id, e.target.value)}
                              className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
                            />
                            <button onClick={() => saveStock(product.id)} disabled={!selectedStoreId || savingStock[product.id]} className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50">
                              {savingStock[product.id] ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null} Save
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${unavailable ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {unavailable ? 'Unavailable' : `${stock} in stock`}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => openEditProduct(product)} className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"><Edit className="h-4 w-4" /></button>
                            <button onClick={() => setDeletingProduct(product)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-gray-950">Categories</h2>
                  <p className="text-sm font-semibold text-gray-500">Create and rename categories before assigning products.</p>
                </div>
                <button onClick={openCreateCategory} className="rounded-xl bg-teal-700 p-2 text-white hover:bg-teal-800"><Plus className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 space-y-2">
                {categories.length === 0 ? <p className="text-sm font-semibold text-gray-500">No categories yet.</p> : categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm font-black text-gray-800">{category.name}</span>
                    <button onClick={() => openEditCategory(category)} className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-teal-700"><Edit className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h2 className="text-xl font-black text-gray-950">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => { setShowProductModal(false); resetProductForm(); }} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveProduct} className="space-y-4 p-6">
              {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}
              <label className="block text-sm font-bold text-gray-700">Product name
                <input required value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="block text-sm font-bold text-gray-700">Description
                <textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" />
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-bold text-gray-700">Price
                  <input required type="number" min="0.01" step="0.01" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500" />
                </label>
                <label className="block text-sm font-bold text-gray-700">Category
                  <select required value={productForm.categoryId} onChange={(e) => setProductForm({ ...productForm, categoryId: e.target.value })} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-emerald-500">
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-bold text-gray-700">Product image
                <div className="mt-1 rounded-2xl border-2 border-dashed border-gray-200 p-4 text-center">
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} disabled={uploading} className="hidden" id="product-image-upload" />
                  <label htmlFor="product-image-upload" className="cursor-pointer">
                    {uploading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" /> : productForm.image ? <img src={productForm.image} alt="Product preview" className="mx-auto h-24 w-24 rounded-xl object-cover" /> : <Upload className="mx-auto h-8 w-8 text-gray-400" />}
                    <span className="mt-2 block text-sm font-bold text-gray-500">Upload JPEG, PNG, WebP, or GIF</span>
                  </label>
                  {productForm.image && <p className="mt-2 inline-flex items-center text-sm font-bold text-emerald-700"><Check className="mr-1 h-4 w-4" /> Image ready</p>}
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowProductModal(false); resetProductForm(); }} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black text-gray-700 hover:bg-gray-200">Cancel</button>
                <button disabled={submitting} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-700 disabled:opacity-50">{submitting ? 'Saving...' : editingProduct ? 'Save Product' : 'Create Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h2 className="text-xl font-black text-gray-950">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => setShowCategoryModal(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveCategory} className="space-y-4 p-6">
              {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</div>}
              <label className="block text-sm font-bold text-gray-700">Category name
                <input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-teal-500" placeholder="Groceries" />
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black text-gray-700 hover:bg-gray-200">Cancel</button>
                <button disabled={submitting} className="flex-1 rounded-xl bg-teal-700 px-4 py-3 font-black text-white hover:bg-teal-800 disabled:opacity-50">{submitting ? 'Saving...' : editingCategory ? 'Save Category' : 'Create Category'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-50 p-3 text-red-700"><AlertTriangle className="h-6 w-6" /></div>
              <div>
                <h2 className="text-xl font-black text-gray-950">Remove product?</h2>
                <p className="text-sm font-semibold text-gray-500">{deletingProduct.name} will be hidden from customers.</p>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDeletingProduct(null)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black text-gray-700 hover:bg-gray-200">Cancel</button>
              <button onClick={deleteProduct} disabled={submitting} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-black text-white hover:bg-red-700 disabled:opacity-50">Delete</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@aagam/utils';
import { Edit, Eye, EyeOff, Image as ImageIcon, Loader2, Plus, Search, Upload, X } from 'lucide-react';

type Category = { id: string; name: string };
type Store = { id: string; name: string; inventory?: Array<{ productId: string; quantity: number }> };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  images?: unknown;
  isActive?: boolean;
  categoryId: string;
  category?: Category;
};

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  image: string;
  images: string[];
  isActive: boolean;
};

const emptyForm = (): ProductForm => ({
  name: '',
  description: '',
  price: '',
  categoryId: '',
  image: '',
  images: [],
  isActive: true,
});

const splitImages = (value: unknown) => Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
const cleanImages = (...values: unknown[]) => Array.from(new Set(values.flatMap(splitImages).map((item) => String(item || '').trim()).filter(Boolean)));

export default function ProductCatalogManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [stockDrafts, setStockDrafts] = useState<Record<string, string>>({});
  const [savingStock, setSavingStock] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [manualUrls, setManualUrls] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const selectedStore = useMemo(() => stores.find((store) => store.id === selectedStoreId), [stores, selectedStoreId]);
  const stockMap = useMemo(() => new Map((selectedStore?.inventory || []).map((item) => [item.productId, item.quantity])), [selectedStore]);

  const load = async () => {
    setLoading(true);
    try {
      const [productRes, categoryRes, storeRes] = await Promise.all([
        apiClient.get('/admin/products'),
        apiClient.get('/products/categories'),
        apiClient.get('/stores'),
      ]);
      const nextProducts = Array.isArray(productRes.data) ? productRes.data : [];
      const nextStores = Array.isArray(storeRes.data) ? storeRes.data : [];
      setProducts(nextProducts);
      setCategories(Array.isArray(categoryRes.data) ? categoryRes.data : []);
      setStores(nextStores);
      setSelectedStoreId((prev) => prev || nextStores[0]?.id || '');
    } catch (err) {
      console.error(err);
      setError('Could not load product catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const product of products) drafts[product.id] = String(stockMap.get(product.id) ?? 0);
    setStockDrafts(drafts);
  }, [products, stockMap]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const textOk = !term || product.name.toLowerCase().includes(term) || product.category?.name?.toLowerCase().includes(term);
      const activeOk = statusFilter === 'all' || (statusFilter === 'active' ? product.isActive !== false : product.isActive === false);
      return textOk && activeOk;
    });
  }, [products, query, statusFilter]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyForm());
    setManualUrls('');
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    const images = cleanImages(product.image, product.images);
    setEditingProduct(product);
    setForm({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      categoryId: product.categoryId,
      image: product.image || images[0] || '',
      images,
      isActive: product.isActive !== false,
    });
    setManualUrls('');
    setDialogOpen(true);
  };

  const uploadImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      files.forEach((file) => body.append('files', file));
      const res = await apiClient.post('/upload/images', body);
      const urls = res.data?.publicUrls || res.data?.images?.map((item: any) => item.publicUrl) || [];
      setForm((prev) => {
        const images = cleanImages(prev.images, urls);
        return { ...prev, images, image: prev.image || images[0] || '' };
      });
      event.target.value = '';
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const addManualUrls = () => {
    const urls = cleanImages(manualUrls);
    if (!urls.length) return;
    setForm((prev) => {
      const images = cleanImages(prev.images, urls);
      return { ...prev, images, image: prev.image || images[0] || '' };
    });
    setManualUrls('');
  };

  const saveProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const images = cleanImages(form.image, form.images, manualUrls);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        categoryId: form.categoryId,
        image: form.image || images[0] || null,
        images,
        isActive: form.isActive,
      };
      if (editingProduct) await apiClient.patch(`/products/${editingProduct.id}`, payload);
      else await apiClient.post('/products', payload);
      setDialogOpen(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not save product.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (product: Product) => {
    await apiClient.patch(`/admin/products/${product.id}/active`, { isActive: product.isActive === false });
    await load();
    setMessage(product.isActive === false ? 'Product activated.' : 'Product made inactive.');
  };

  const saveStock = async (productId: string) => {
    const quantity = Math.max(0, Math.floor(Number(stockDrafts[productId] || 0)));
    setSavingStock((prev) => ({ ...prev, [productId]: true }));
    try {
      await apiClient.patch(`/stores/${selectedStoreId}/inventory`, { productId, quantity });
      await load();
      setMessage('Inventory updated.');
    } finally {
      setSavingStock((prev) => ({ ...prev, [productId]: false }));
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">Catalog operations</p>
          <h1 className="mt-3 text-3xl font-black text-gray-950">Product Catalog</h1>
          <p className="text-sm font-semibold text-gray-500">Hide seasonal products and upload multiple product images.</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white">
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Products" value={products.length} />
        <Stat label="Active" value={products.filter((p) => p.isActive !== false).length} />
        <Stat label="Inactive" value={products.filter((p) => p.isActive === false).length} />
      </div>

      <div className="rounded-3xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm font-semibold" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-bold">
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </div>
          {message && <p className="mt-3 text-sm font-bold text-emerald-700">{message}</p>}
          {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Product</th>
                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Category</th>
                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Price</th>
                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Stock</th>
                <th className="px-6 py-4 text-xs font-black uppercase text-gray-500">Status</th>
                <th className="px-6 py-4 text-right text-xs font-black uppercase text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? <tr><td colSpan={6} className="px-6 py-12 text-center text-sm font-bold text-gray-500">Loading catalog...</td></tr> : filteredProducts.map((product) => (
                <ProductRow key={product.id} product={product} stock={stockDrafts[product.id] || '0'} saving={Boolean(savingStock[product.id])} onStockChange={(value) => setStockDrafts((prev) => ({ ...prev, [product.id]: value }))} onSaveStock={() => saveStock(product.id)} onToggle={() => toggleActive(product)} onEdit={() => openEdit(product)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white p-6">
              <h2 className="text-xl font-black text-gray-950">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
              <button onClick={() => setDialogOpen(false)} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveProduct} className="space-y-5 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Product name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
                <Field label="Price" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} required />
                <label className="block text-sm font-bold text-gray-700">Category
                  <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="mt-1 w-full rounded-xl border px-4 py-2.5">
                    <option value="">Select category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <label className="flex items-center justify-between rounded-2xl border bg-gray-50 px-4 py-3 text-sm font-bold">
                  <span>Visible to customers</span>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                </label>
              </div>

              <label className="block text-sm font-bold text-gray-700">Upload product images
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={uploadImages} disabled={uploading} className="mt-1 block w-full rounded-xl border border-dashed p-4 text-sm" />
                {uploading && <span className="mt-2 inline-flex items-center text-sm font-bold text-emerald-700"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Uploading...</span>}
              </label>

              {form.images.length > 0 && <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{form.images.map((url) => <ImageTile key={url} url={url} main={form.image === url} onMain={() => setForm({ ...form, image: url })} onRemove={() => setForm({ ...form, images: form.images.filter((item) => item !== url), image: form.image === url ? '' : form.image })} />)}</div>}

              <label className="block text-sm font-bold text-gray-700">Add image URLs
                <textarea value={manualUrls} onChange={(e) => setManualUrls(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border px-4 py-2.5" />
                <button type="button" onClick={addManualUrls} className="mt-2 rounded-xl bg-gray-100 px-4 py-2 text-xs font-black">Add URLs</button>
              </label>

              <label className="block text-sm font-bold text-gray-700">Description
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1 w-full rounded-xl border px-4 py-2.5" />
              </label>

              <div className="flex gap-3 border-t pt-4">
                <button type="button" onClick={() => setDialogOpen(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-3 font-black">Cancel</button>
                <button disabled={submitting} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 font-black text-white disabled:opacity-50">{submitting ? 'Saving...' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-gray-500">{label}</p><p className="mt-1 text-2xl font-black text-gray-950">{value}</p></div>;
}

function ProductRow({ product, stock, saving, onStockChange, onSaveStock, onToggle, onEdit }: { product: Product; stock: string; saving: boolean; onStockChange: (value: string) => void; onSaveStock: () => void; onToggle: () => void; onEdit: () => void }) {
  const inactive = product.isActive === false;
  return <tr className={inactive ? 'bg-amber-50/40' : 'hover:bg-gray-50'}><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border bg-gray-100">{product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-400" />}</div><div><p className="text-sm font-black text-gray-950">{product.name}</p><p className="text-xs font-semibold text-gray-500">{inactive ? 'Not visible to customers' : product.description || 'No description'}</p></div></div></td><td className="px-6 py-4 text-sm font-bold text-gray-700">{product.category?.name || 'Uncategorized'}</td><td className="px-6 py-4 text-sm font-black text-gray-950">₹{Number(product.price || 0).toFixed(2)}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><input type="number" min={0} value={stock} onChange={(e) => onStockChange(e.target.value)} className="w-20 rounded-lg border px-2 py-1.5 text-sm font-bold" /><button onClick={onSaveStock} disabled={saving} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">{saving ? '...' : 'Save'}</button></div></td><td className="px-6 py-4"><span className={`rounded-full px-3 py-1 text-xs font-black ${inactive ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{inactive ? 'Inactive' : 'Active'}</span></td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={onToggle} className="rounded-lg p-2 text-gray-500 hover:bg-gray-50">{inactive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button><button onClick={onEdit} className="rounded-lg p-2 text-gray-500 hover:bg-gray-50"><Edit className="h-4 w-4" /></button></div></td></tr>;
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="block text-sm font-bold text-gray-700">{label}<input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-xl border px-4 py-2.5" /></label>;
}

function ImageTile({ url, main, onMain, onRemove }: { url: string; main: boolean; onMain: () => void; onRemove: () => void }) {
  return <div className={`rounded-2xl border p-2 ${main ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200'}`}><img src={url} alt="Product" className="h-24 w-full rounded-xl object-cover" /><div className="mt-2 flex gap-1"><button type="button" onClick={onMain} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-black text-white">Main</button><button type="button" onClick={onRemove} className="rounded-lg bg-red-50 px-2 py-1 text-xs font-black text-red-700">Remove</button></div></div>;
}

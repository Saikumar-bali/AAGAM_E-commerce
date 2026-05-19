'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { 
  Package, Tag, DollarSign, Plus, Search, Edit, Trash2,
  Image as ImageIcon, Calendar, TrendingUp, X, Loader2, Eye, AlertTriangle,
  Upload, Check
} from 'lucide-react';

interface Product {
  id: string; name: string; description: string | null; price: number;
  image: string | null; categoryId: string; createdAt: string;
  category?: { id: string; name: string };
}

interface Category { id: string; name: string; }

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', price: '', categoryId: '', image: '' });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        apiClient.get('/products'), apiClient.get('/products/categories'),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) { console.error('Failed to fetch data', err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || p.category?.name === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalProducts = products.length;
  const totalValue = products.reduce((acc, p) => acc + p.price, 0);
  const avgPrice = totalProducts > 0 ? totalValue / totalProducts : 0;

  const stats = [
    { label: 'Total Products', value: totalProducts, icon: Package, color: 'bg-blue-500' },
    { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-purple-500' },
    { label: 'Avg. Price', value: `₹${avgPrice.toFixed(2)}`, icon: DollarSign, color: 'bg-emerald-500' },
    { label: 'This Month', value: products.filter(p => new Date(p.createdAt) > new Date(Date.now() - 30*24*60*60*1000)).length, icon: TrendingUp, color: 'bg-amber-500' },
  ];

  const resetForm = () => {
    setFormData({ name: '', description: '', price: '', categoryId: '', image: '' });
    setPreviewUrl('');
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setError('Please select a valid image file (JPEG, PNG, WebP, or GIF)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      console.log('[ADMIN] Starting image upload...');
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const response = await apiClient.post('/upload/image', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const publicUrl = response.data.publicUrl;
      console.log('[ADMIN] Upload success, URL:', publicUrl);

      if (!publicUrl) throw new Error('No publicUrl returned from server');

      setFormData(prev => ({ ...prev, image: publicUrl }));
    } catch (err: any) {
      console.error('[ADMIN] Upload error:', err);
      console.error('[ADMIN] Error response:', err.response?.data);
      setError(err.response?.data?.message || err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/products', {
        name: formData.name, description: formData.description || null,
        price: parseFloat(formData.price), categoryId: formData.categoryId,
        image: formData.image || null
      });
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to create product'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name, description: product.description || '',
      price: product.price.toString(), categoryId: product.categoryId,
      image: product.image || ''
    });
    setPreviewUrl(product.image || '');
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.patch(`/products/${selectedProduct.id}`, {
        name: formData.name, description: formData.description || null,
        price: parseFloat(formData.price), categoryId: formData.categoryId,
        image: formData.image || null
      });
      setShowEditModal(false);
      setSelectedProduct(null);
      resetForm();
      fetchData();
    } catch (err: any) { setError(err.response?.data?.message || 'Failed to update product'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (product: Product) => {
    setSelectedProduct(product);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedProduct) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/products/${selectedProduct.id}`);
      setShowDeleteModal(false);
      setSelectedProduct(null);
      fetchData();
    } catch (err) { console.error('Failed to delete product', err); }
    finally { setDeleting(false); }
  };

  const handleView = (product: Product) => {
    setSelectedProduct(product);
    setShowViewModal(true);
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div><h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1><p className="text-gray-500">Manage products and categories</p></div>
          <button onClick={() => setShowModal(true)} className="flex items-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700">
            <Plus className="h-5 w-5 mr-2" />Add Product
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div><p className="text-sm text-gray-500">{stat.label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p></div>
                <div className={`p-3 rounded-xl ${stat.color}`}><stat.icon className="h-6 w-6 text-white" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search products..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-emerald-500"
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 text-gray-700 focus:ring-2 focus:ring-emerald-500">
              <option value="All">All Categories</option>
              {categories.map(cat => (<option key={cat.id} value={cat.name}>{cat.name}</option>))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Product</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Price</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">Created</th>
              <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? [1,2,3].map(i => (
                <tr key={i} className="animate-pulse"><td className="px-6 py-4"><div className="h-12 bg-gray-100 rounded w-56"></div></td>
                <td className="px-6 py-4"><div className="h-6 bg-gray-100 rounded w-24"></div></td>
                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-8 ml-auto"></div></td></tr>
              )) : filteredProducts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center"><Package className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500">No products found</p></td></tr>
              ) : filteredProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 group">
                  <td className="px-6 py-4"><div className="flex items-center">
                    <div className="h-12 w-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden mr-4 border border-gray-200">
                      {product.image ? (
                        <img 
                          src={product.image} 
                          alt={product.name} 
                          className="h-full w-full object-cover" 
                          onLoad={() => console.log(`[IMAGE DEBUG] Successfully loaded: ${product.image}`)}
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.error(`[IMAGE DEBUG] Failed to load: ${target.src}`);
                            // Optional: you could set a fallback image here
                          }}
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-400"><ImageIcon className="h-6 w-6" /></div>
                      )}
                    </div>
                    <div><p className="text-sm font-bold text-gray-900">{product.name}</p><p className="text-xs text-gray-500 truncate max-w-xs">{product.description || 'No description'}</p></div>
                  </div></td>
                  <td className="px-6 py-4"><span className="inline-flex px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700"><Tag className="h-3 w-3 mr-1" />{product.category?.name}</span></td>
                  <td className="px-6 py-4"><p className="text-sm font-bold text-gray-900">₹{product.price.toFixed(2)}</p></td>
                  <td className="px-6 py-4"><p className="text-sm text-gray-500">{new Date(product.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p></td>
                  <td className="px-6 py-4 text-right"><div className="flex justify-end space-x-1.5">
                    <button onClick={() => handleView(product)} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg opacity-0 group-hover:opacity-100"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => handleEdit(product)} className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg opacity-0 group-hover:opacity-100"><Edit className="h-4 w-4" /></button>
                    <button onClick={() => handleDelete(product)} disabled={deleting} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Product</h2>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input type="text" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                    value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Enter product name" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 resize-none" rows={3}
                    value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Enter description (optional)" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                    <input type="number" step="0.01" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} placeholder="9.99" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})}>
                      <option value="">Select category</option>
                      {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                    </select></div></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-emerald-400 transition-colors">
                      <label className="cursor-pointer flex flex-col items-center">
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                        {uploading ? (
                          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                        ) : formData.image ? (
                          <div className="relative">
                            <img src={formData.image} alt="Uploaded" className="w-24 h-24 object-cover rounded-lg" />
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                              <Upload className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            <span className="text-sm text-gray-500">Click to upload image</span>
                            <span className="text-xs text-gray-400">JPEG, PNG, WebP (max 5MB)</span>
                          </>
                        )}
                      </label>
                    </div>
                    {formData.image && (
                      <div className="flex items-center gap-2 text-sm text-emerald-600">
                        <Check className="h-4 w-4" /> Image ready for product creation
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center">
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Product</h2>
              <button onClick={() => { setShowEditModal(false); setSelectedProduct(null); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <form onSubmit={handleUpdate} className="p-6">
              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <div className="space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input type="text" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                    value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500 resize-none" rows={3}
                    value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                    <input type="number" step="0.01" required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select required className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:ring-2 focus:ring-emerald-500"
                      value={formData.categoryId} onChange={(e) => setFormData({...formData, categoryId: e.target.value})}>
                      <option value="">Select category</option>
                      {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                    </select></div></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Product Image</label>
                  <div className="space-y-3">
                    <div className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl p-4 hover:border-emerald-400 transition-colors">
                      <label className="cursor-pointer flex flex-col items-center">
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="hidden" disabled={uploading} />
                        {uploading ? (
                          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                        ) : formData.image ? (
                          <div className="relative">
                            <img src={formData.image} alt="Current" className="w-24 h-24 object-cover rounded-lg" />
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg opacity-0 hover:opacity-100 transition-opacity">
                              <Upload className="h-6 w-6 text-white" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-gray-400 mb-2" />
                            <span className="text-sm text-gray-500">Click to upload image</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => { setShowEditModal(false); setSelectedProduct(null); resetForm(); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center">
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Update Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Product Modal */}
      {showViewModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Product Details</h2>
              <button onClick={() => { setShowViewModal(false); setSelectedProduct(null); }} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
            </div>
            <div className="p-6">
              <div className="flex items-start mb-6">
                <div className="h-24 w-24 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden mr-6 border border-gray-200">
                  {selectedProduct.image ? <img src={selectedProduct.image} alt={selectedProduct.name} className="h-full w-full object-cover" /> :
                    <div className="h-full w-full flex items-center justify-center text-gray-400"><ImageIcon className="h-10 w-10" /></div>}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900">{selectedProduct.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{selectedProduct.description || 'No description'}</p>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 mt-2"><Tag className="h-3 w-3 mr-1" />{selectedProduct.category?.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-xs text-gray-500">Price</p><p className="text-xl font-bold text-gray-900">₹{selectedProduct.price.toFixed(2)}</p></div>
                <div className="bg-gray-50 rounded-xl p-4"><p className="text-xs text-gray-500">Created</p><p className="text-sm font-bold text-gray-900">{new Date(selectedProduct.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button onClick={() => { setShowViewModal(false); setSelectedProduct(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Close</button>
              <button onClick={() => { setShowViewModal(false); handleEdit(selectedProduct); }} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700">Edit Product</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Delete Product</h2>
              <p className="text-gray-500">Are you sure you want to delete <span className="font-semibold text-gray-900">"{selectedProduct.name}"</span>? This action cannot be undone.</p>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button onClick={() => { setShowDeleteModal(false); setSelectedProduct(null); }} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center">
                {deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
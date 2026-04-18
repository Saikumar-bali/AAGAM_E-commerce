'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { 
  Package, 
  Tag, 
  DollarSign, 
  Plus, 
  Search, 
  Edit,
  Trash2,
  Image as ImageIcon,
  Eye,
  Calendar,
  TrendingUp,
  X,
  Loader2
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

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    image: ''
  });
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      const [productsRes, categoriesRes] = await Promise.all([
        apiClient.get('/products'),
        apiClient.get('/products/categories'),
      ]);
      setProducts(productsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'All' || product.category?.name === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const totalProducts = products.length;
  const totalValue = products.reduce((acc, p) => acc + p.price, 0);
  const avgPrice = totalProducts > 0 ? totalValue / totalProducts : 0;

  const stats = [
    { label: 'Total Products', value: totalProducts, icon: Package, color: 'bg-blue-500' },
    { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-purple-500' },
    { label: 'Avg. Price', value: `$${avgPrice.toFixed(2)}`, icon: DollarSign, color: 'bg-emerald-500' },
    { label: 'This Month', value: products.filter(p => new Date(p.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length, icon: TrendingUp, color: 'bg-amber-500' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/products', {
        name: formData.name,
        description: formData.description || null,
        price: parseFloat(formData.price),
        categoryId: formData.categoryId,
        image: formData.image || null
      });
      setShowModal(false);
      setFormData({ name: '', description: '', price: '', categoryId: '', image: '' });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
            <p className="text-gray-500">Manage your product inventory and pricing.</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Product
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
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
              <input 
                type="text" 
                placeholder="Search products..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-12 bg-gray-100 rounded w-56"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-gray-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-8 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No products found</p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-12 w-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden mr-4 border border-gray-200">
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-gray-400">
                              <ImageIcon className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500 line-clamp-1 max-w-xs">{product.description || 'No description'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                        <Tag className="h-3 w-3 mr-1.5" />
                        {product.category?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm font-bold text-gray-900">
                        <DollarSign className="h-3 w-3 text-gray-400 mr-0.5" />
                        {product.price.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                        {new Date(product.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-1.5">
                        <button className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Product</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Enter product name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Enter description (optional)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.price}
                      onChange={(e) => setFormData({...formData, price: e.target.value})}
                      placeholder="9.99"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      value={formData.categoryId}
                      onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                    >
                      <option value="">Select category</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                  <input
                    type="url"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.image}
                    onChange={(e) => setFormData({...formData, image: e.target.value})}
                    placeholder="https://example.com/image.jpg (optional)"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center"
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
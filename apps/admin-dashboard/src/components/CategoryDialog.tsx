'use client';

import React, { useState } from 'react';
import SortableCategories from '@/components/SortableCategories';
import { X, Tag, Loader2 } from 'lucide-react';

type Category = { id: string; name: string; imageUrl?: string | null; sortOrder?: number };

interface CategoryDialogProps {
  categories: Category[];
  productCounts: Record<string, number>;
  onSave: (name: string, editingCategory: Category | null) => Promise<void>;
  onDelete: (category: Category) => Promise<void>;
  onReorder: (categories: Category[]) => void;
  onClose: () => void;
  submitting: boolean;
  error: string;
}

export default function CategoryDialog({
  categories,
  productCounts,
  onSave,
  onDelete,
  onReorder,
  onClose,
  submitting,
  error,
}: CategoryDialogProps) {
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    try {
      await onSave(categoryName, editingCategory);
      setCategoryName('');
      setEditingCategory(null);
    } catch (err: any) {
      setLocalError(err.message || 'Failed to save category.');
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setCategoryName(category.name);
  };

  const handleDelete = async (category: Category) => {
    if (confirm(`Delete "${category.name}"? This cannot be undone.`)) {
      await onDelete(category);
    }
  };

  const displayError = localError || error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white ">
        <div className="flex items-center justify-between border-b border-gray-100 p-6">
          <div>
            <h2 id="category-dialog-title" className="text-xl font-semibold text-gray-950">Manage Categories</h2>
            <p className="text-sm font-semibold text-gray-500">
              Create, edit, delete, and drag to reorder categories.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Create/Edit Form */}
          <form onSubmit={handleSubmit} className="mb-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
              {editingCategory ? 'Edit category' : 'Create category'}
            </h3>
            {displayError && (
              <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
                {displayError}
              </div>
            )}
            <label htmlFor="category-name-input" className="mt-4 block text-sm font-bold text-gray-700">
              Category name
              <input
                id="category-name-input"
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Fresh Dairy"
                className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:ring-2 focus:ring-teal-500"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => { setEditingCategory(null); setCategoryName(''); setLocalError(''); }}
                className="flex-1 rounded-xl bg-white px-4 py-3 font-semibold text-gray-700 hover:bg-gray-100"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="flex-1 rounded-xl bg-teal-700 px-4 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : editingCategory ? (
                  'Save'
                ) : (
                  'Create'
                )}
              </button>
            </div>
          </form>

          {/* Sortable Category List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                Existing categories
              </h3>
              <span className="text-xs font-semibold text-gray-400">
                Drag to reorder
              </span>
            </div>
            {categories.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm font-semibold text-gray-400">
                No categories yet. Create one above.
              </p>
            ) : (
              <SortableCategories
                categories={categories}
                onReorder={onReorder}
                onEdit={handleEdit}
                onDelete={handleDelete}
                productCounts={productCounts}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

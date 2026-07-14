'use client';

import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Image as ImageIcon, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';

type Category = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  isActive?: boolean;
  categoryId: string;
  category?: Category;
  sortOrder?: number;
};

interface SortableProductsProps {
  products: Product[];
  onReorder: (products: Product[]) => void;
  onToggleVisibility: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  stockDrafts: Record<string, string>;
  onStockChange: (productId: string, value: string) => void;
  onSaveStock: (productId: string) => void;
  savingStock: Record<string, boolean>;
  selectedStoreId: string;
}

function SortableProduct({
  product,
  onToggleVisibility,
  onEdit,
  onDelete,
  stock,
  onStockChange,
  onSaveStock,
  savingStock,
  selectedStoreId,
}: {
  product: Product;
  onToggleVisibility: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  stock: string;
  onStockChange: (productId: string, value: string) => void;
  onSaveStock: (productId: string) => void;
  savingStock: boolean;
  selectedStoreId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  };

  const inactive = product.isActive === false;
  const unavailable = Number(stock || 0) <= 0;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={inactive || unavailable ? 'bg-gray-50/70 text-gray-400' : 'hover:bg-gray-50'}
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </button>
          <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
            {product.image ? (
              <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-black text-gray-950">{product.name}</p>
            <p className="max-w-xs truncate text-xs font-semibold text-gray-500">
              {inactive ? 'Hidden from customers' : product.description || 'No description'}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">
          {product.category?.name || 'Uncategorized'}
        </span>
      </td>
      <td className="px-6 py-4 text-sm font-black text-gray-950">
        ₹{Number(product.price || 0).toFixed(2)}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={stock}
            onChange={(e) => onStockChange(product.id, e.target.value)}
            className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-bold text-gray-900 focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={() => onSaveStock(product.id)}
            disabled={!selectedStoreId || savingStock}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
            inactive
              ? 'bg-amber-100 text-amber-800'
              : unavailable
              ? 'bg-red-50 text-red-700'
              : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {inactive ? 'Inactive / hidden' : unavailable ? 'Out of stock' : 'Active'}
        </span>
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onToggleVisibility(product)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={inactive ? 'Show to customers' : 'Hide from customers'}
          >
            {inactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <button
            onClick={() => onEdit(product)}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(product)}
            className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function SortableProducts({
  products,
  onReorder,
  onToggleVisibility,
  onEdit,
  onDelete,
  stockDrafts,
  onStockChange,
  onSaveStock,
  savingStock,
  selectedStoreId,
}: SortableProductsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = products.findIndex((p) => p.id === active.id);
      const newIndex = products.findIndex((p) => p.id === over?.id);

      const reordered = arrayMove(products, oldIndex, newIndex).map((prod, index) => ({
        ...prod,
        sortOrder: index + 1,
      }));

      onReorder(reordered);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={products.map((p) => p.id)}
        strategy={verticalListSortingStrategy}
      >
        <tbody className="divide-y divide-gray-50">
          {products.map((product) => (
            <SortableProduct
              key={product.id}
              product={product}
              onToggleVisibility={onToggleVisibility}
              onEdit={onEdit}
              onDelete={onDelete}
              stock={stockDrafts[product.id] ?? '0'}
              onStockChange={onStockChange}
              onSaveStock={onSaveStock}
              savingStock={savingStock[product.id] ?? false}
              selectedStoreId={selectedStoreId}
            />
          ))}
        </tbody>
      </SortableContext>
    </DndContext>
  );
}

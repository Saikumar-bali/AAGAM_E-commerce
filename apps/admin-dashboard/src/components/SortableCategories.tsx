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
import { GripVertical, Tag, Trash2, Edit } from 'lucide-react';

type Category = { id: string; name: string; imageUrl?: string | null; sortOrder?: number };

interface SortableCategoriesProps {
  categories: Category[];
  onReorder: (categories: Category[]) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  productCounts: Record<string, number>;
}

function SortableCategory({
  category,
  onEdit,
  onDelete,
  productCount,
}: {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  productCount: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 0,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        isDragging ? 'border-teal-300 bg-teal-50 shadow-lg' : 'border-gray-100 bg-white hover:bg-gray-50'
      }`}
    >
      <button
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      {category.imageUrl ? <img src={category.imageUrl} alt="" className="h-10 w-10 rounded-xl border border-gray-100 object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50"><Tag className="h-4 w-4 text-teal-600" /></span>}
      <span className="flex-1 text-sm font-bold text-gray-900">{category.name}</span>
      <span className="text-xs font-semibold text-gray-500">{productCount} products</span>
      <button
        onClick={() => onEdit(category)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <Edit className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(category)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SortableCategories({
  categories,
  onReorder,
  onEdit,
  onDelete,
  productCounts,
}: SortableCategoriesProps) {
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
      const oldIndex = categories.findIndex((c) => c.id === active.id);
      const newIndex = categories.findIndex((c) => c.id === over?.id);

      const reordered = arrayMove(categories, oldIndex, newIndex).map((cat, index) => ({
        ...cat,
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
        items={categories.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {categories.map((category) => (
            <SortableCategory
              key={category.id}
              category={category}
              onEdit={onEdit}
              onDelete={onDelete}
              productCount={productCounts[category.id] || 0}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

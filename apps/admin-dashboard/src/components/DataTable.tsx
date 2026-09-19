'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search as SearchIcon } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T, index: number) => string;
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  loading?: boolean;
  striped?: boolean;
  hover?: boolean;
  bordered?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  maxHeight?: string;
  onRowClick?: (row: T, index: number) => void;
  rowClassName?: (row: T, index: number) => string;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  title,
  subtitle,
  searchPlaceholder,
  emptyText = 'No records found',
  loading = false,
  striped = true,
  hover = true,
  bordered = true,
  compact = false,
  stickyHeader = true,
  maxHeight,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const query = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const value = col.render(row, 0);
        if (typeof value === 'string') return value.toLowerCase().includes(query);
        if (typeof value === 'number') return String(value).includes(query);
        return false;
      })
    );
  }, [data, columns, search]);

  const padding = compact ? 'px-3 py-2.5' : 'px-4 py-3.5';

  return (
    <div className={bordered ? 'overflow-hidden rounded-xl border border-slate-200 bg-white ' : ''}>
      {(title || searchPlaceholder) && (
        <div className={bordered ? 'border-b border-slate-100 bg-slate-50/50' : ''}>
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {title ? <h3 className="text-sm font-semibold text-slate-900">{title}</h3> : null}
              {subtitle ? <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p> : null}
            </div>
            {searchPlaceholder && (
              <div className="relative w-full max-w-xs">
                <SearchIcon className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder || 'Search table'}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={stickyHeader && maxHeight ? `overflow-auto ${maxHeight}` : 'overflow-x-auto'}>
        <table className="w-full text-left">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${padding} text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                  style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={`skeleton-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key} className={`${padding} ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}>
                      <div className="h-4 w-full max-w-[180px] animate-pulse rounded bg-slate-100" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={`${padding} text-center`}>
                  <div className="flex flex-col items-center justify-center py-8">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                      <span className="text-lg text-slate-400">∅</span>
                    </div>
                    <p className="text-sm font-bold text-slate-500">{emptyText}</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredData.map((row, index) => {
                const baseClass = onRowClick ? 'cursor-pointer' : '';
                const stripClass = striped && index % 2 === 1 ? 'bg-slate-50/40' : '';
                const hoverClass = hover ? 'hover:bg-slate-50/80' : '';
                const customClass = rowClassName ? rowClassName(row, index) : '';
                return (
                  <tr
                    key={keyExtractor(row, index)}
                    className={`transition-colors ${baseClass} ${stripClass} ${hoverClass} ${customClass}`}
                    onClick={onRowClick ? () => onRowClick(row, index) : undefined}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${padding} text-sm text-slate-700 ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''}`}
                      >
                        {col.render(row, index)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && filteredData.length > 0 && (
        <div className={`flex items-center justify-between border-t border-slate-100 px-4 py-2.5 ${bordered ? '' : ''}`}>
          <p className="text-[11px] font-semibold text-slate-400">
            Showing {filteredData.length} {filteredData.length === 1 ? 'record' : 'records'}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-[11px] font-semibold text-teal-600 hover:text-teal-700"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default DataTable;

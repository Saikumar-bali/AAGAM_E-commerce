"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

type OpsModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Selector for the field that should receive focus when the dialog opens. */
  initialFocus?: string;
};

/**
 * Accessible dialog built on the native <dialog> element: showModal() gives the
 * focus trap, the inert background and Escape handling, and focus returns to
 * whatever opened it when the dialog closes.
 */
export default function OpsModal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  initialFocus,
}: OpsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();
      const target =
        (initialFocus
          ? dialog.querySelector<HTMLElement>(initialFocus)
          : null) ??
        dialog.querySelector<HTMLElement>(
          "input:not([type='hidden']), select, textarea"
        );
      target?.focus();
      return;
    }

    if (dialog.open) dialog.close();
    const opener = openerRef.current;
    if (opener && document.contains(opener)) opener.focus();
  }, [open, initialFocus]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="ops-modal-title"
      aria-describedby={description ? "ops-modal-description" : undefined}
      onCancel={(event) => {
        // Let React own the open state instead of the element closing itself.
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl m-auto max-h-[92vh] [&::backdrop]:bg-slate-950/60"
    >
      <div className="max-h-[92vh] overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="ops-modal-title"
              className="text-lg font-semibold tracking-tight text-slate-950"
            >
              {title}
            </h2>
            {description && (
              <p
                id="ops-modal-description"
                className="mt-1 text-sm text-slate-500"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">{children}</div>

        {footer && (
          <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row-reverse">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}

/** Visible label + control pair used inside OpsModal forms. */
export function OpsField({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold text-slate-600"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          className="mt-1 flex items-center gap-1 text-xs font-semibold text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}

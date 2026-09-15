# Palette's Journal - UX & Accessibility Learnings

## 2026-03-30 - Category Dialog Accessibility & Loading States
**Learning:** Icon-only buttons (like reorder handles, edit, delete, and modal close buttons) in dialogs need explicit ARIA labels and `type="button"` attributes to be properly announced by screen readers and avoid inadvertent form submission. Adding loading spinners inside submit buttons provides immediate visual feedback during async save operations.
**Action:** Always inspect dialogs and sortable lists for missing `aria-label`, `role="dialog"`, `aria-modal="true"`, and button loading feedback.

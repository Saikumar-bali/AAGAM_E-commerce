import fs from 'node:fs';
import path from 'node:path';

/**
 * The dashboard has no shared route-group layout: every page mounts
 * <DashboardLayout> itself, so each navigation unmounts and remounts the
 * sidebar. Reading the fold preference only in an effect made a remount paint
 * expanded and then fold — the "flash expand then collapse" seen when clicking
 * another menu item while folded. These assertions pin the mechanism that
 * keeps a remount painted in the stored state: a module-level cache seeded
 * into the initial useState, a pre-paint layout-effect sync for full page
 * loads, and a toggle that keeps cache and localStorage together.
 */
describe('sidebar collapse preference across remounts', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'Sidebar.tsx'), 'utf8');

  it('seeds the initial state from a module-level cache that survives remounts', () => {
    expect(source).toContain('let collapsedPreferenceCache: boolean | null = null');
    expect(source).toContain('React.useState(() => collapsedPreferenceCache ?? false)');
    // The mount-only effect is gone: on a navigation remount it ran AFTER the
    // expanded first paint, which is the flash itself.
    expect(source).not.toContain('setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1")');
  });

  it('syncs the stored value before paint on a full page load', () => {
    expect(source).toContain('const useIsomorphicLayoutEffect = typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect');
    expect(source).toContain('useIsomorphicLayoutEffect(() => {');
    expect(source).toContain('const stored = window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1"');
    expect(source).toContain('collapsedPreferenceCache = stored');
  });

  it('keeps cache and localStorage together on every toggle', () => {
    expect(source).toContain('collapsedPreferenceCache = next;');
    expect(source).toContain('window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, next ? "1" : "0")');
  });
});

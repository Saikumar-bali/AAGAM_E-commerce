from pathlib import Path

replacements = {
    'apps/admin-dashboard/src/app/page.tsx': [
        ('<Link href="/shop/support">Customer support</Link>', '<Link href="/login?returnTo=%2Fshop%2Fsupport">Customer support</Link>'),
    ],
    'apps/admin-dashboard/src/components/DashboardLayout.tsx': [
        ("router.replace('/login');", "router.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);"),
    ],
    'apps/admin-dashboard/src/app/(auth)/login/page.tsx': [
        (
            "const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;",
            "const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;\n\nfunction safeCustomerReturnPath(search: string) {\n  const requested = new URLSearchParams(search).get('returnTo');\n  return requested === '/shop' || requested?.startsWith('/shop/') ? requested : '/shop';\n}",
        ),
        ("else router.push('/shop');", "else router.push(safeCustomerReturnPath(window.location.search));"),
    ],
    'scripts/aagam-production-ux.contract.test.js': [
        (
            "contains(map, 'maxZoom: 16', 'Tracking bounds must not zoom out farther than the intended delivery view.');",
            "contains(map, 'maxZoom: 16', 'Tracking bounds must not zoom in farther than the intended delivery view.');\ncontains(map, 'minZoom: 8', 'Tracking bounds must be able to show serviceable multi-kilometre deliveries.');\nexcludes(map, 'minZoom: 14', 'Tracking bounds must not hide a distant rider or destination.');",
        ),
    ],
}

for filename, pairs in replacements.items():
    path = Path(filename)
    source = path.read_text()
    updated = source
    for old, new in pairs:
        if old in updated:
            updated = updated.replace(old, new)
        elif new not in updated:
            raise SystemExit(f'Expected source fragment not found in {filename}: {old}')
    if updated != source:
        path.write_text(updated)

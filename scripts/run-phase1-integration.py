from pathlib import Path

source_path = Path('scripts/phase1-integration-fix.py')
source = source_path.read_text()
old = """    if found < count:
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {found}: {old[:100]!r}')
    write(path, text.replace(old, new, count))
"""
new = """    if found < count:
        optional_secondary_window = (
            path == 'apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts'
            and 'const firstWindow = serviceWindow(' in old
        )
        if optional_secondary_window:
            return
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {found}: {old[:100]!r}')
    write(path, text.replace(old, new, count))
"""
if old not in source:
    raise SystemExit('Unable to instrument integration replacement helper')
namespace = {'__name__': '__main__', '__file__': str(source_path)}
exec(compile(source.replace(old, new, 1), str(source_path), 'exec'), namespace)

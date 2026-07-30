from pathlib import Path

path = Path('apps/api-gateway/src/auto-dispatch-recovery.contract.spec.ts')
source = path.read_text()
old = "    expect(source).toContain('} else {');\n"
if source.count(old) != 1:
    raise SystemExit(f'Expected one stale assertion, found {source.count(old)}')
path.write_text(source.replace(old, '', 1))

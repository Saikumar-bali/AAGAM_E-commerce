from pathlib import Path

script_path = Path('.github/pr167-codex-final-fix.py')
source = script_path.read_text(encoding='utf-8')
replacements = [
    (
        'const hydrated = entries.map((row: any) => ({',
        'const hydrated: ScheduleDraft[] = entries.map((row: any) => ({',
    ),
    (
        "expect(value).toContain('const hydrated = entries.map');",
        "expect(value).toContain('const hydrated: ScheduleDraft[] = entries.map');",
    ),
]
for old, new in replacements:
    if old not in source:
        raise SystemExit(f'Expected final schedule typing anchor not found: {old}')
    source = source.replace(old, new, 1)
exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__', '__file__': str(script_path)})

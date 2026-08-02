from pathlib import Path

script_path = Path('.github/pr167-repair.py')
source = script_path.read_text(encoding='utf-8')

replacements = [
    (
        r'''text, count = re.subn(r"\n\s*placeholderData:\s*\(previousData\)\s*=>\s*previousData,", "", text, count=1)''',
        r'''text, count = re.subn(r"\n\s*placeholderData:\s*\([^)]*\)\s*=>\s*[^,]+,", "", text, count=1)''',
        'Store Orders placeholder callback anchor',
    ),
    (
        '''marker = "  const totalPages = Math.max(1, Number(data?.meta?.totalPages || 1));"''',
        '''marker = "  const totalPages = Math.max(1, Number(ordersQuery.data?.totalPages || 1));"''',
        'Store Orders total-pages response anchor',
    ),
]

for old, new, label in replacements:
    if old not in source:
        raise SystemExit(f'{label} was not found in the repair script')
    source = source.replace(old, new, 1)

exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__', '__file__': str(script_path)})

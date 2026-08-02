from pathlib import Path

script_path = Path('.github/pr167-repair.py')
source = script_path.read_text(encoding='utf-8')
old = r'''text, count = re.subn(r"\n\s*placeholderData:\s*\(previousData\)\s*=>\s*previousData,", "", text, count=1)'''
new = r'''text, count = re.subn(r"\n\s*placeholderData:\s*\([^)]*\)\s*=>\s*[^,]+,", "", text, count=1)'''
if old not in source:
    raise SystemExit('Store Orders repair anchor was not found in the repair script')
source = source.replace(old, new, 1)
exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__', '__file__': str(script_path)})

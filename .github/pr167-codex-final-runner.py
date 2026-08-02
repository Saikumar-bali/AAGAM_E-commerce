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
    (
        "expect(value.indexOf('workspaceQuery.isError')).toBeLessThan(value.indexOf('if (!activeJob)'));",
        "const errorBranch = value.indexOf('if (workspaceQuery.isError)');\n    const emptyBranch = value.indexOf('if (!activeJob) return <Empty', errorBranch);\n    expect(errorBranch).toBeGreaterThanOrEqual(0);\n    expect(emptyBranch).toBeGreaterThan(errorBranch);",
    ),
]
for old, new in replacements:
    if old not in source:
        raise SystemExit(f'Expected final remediation anchor not found: {old}')
    source = source.replace(old, new, 1)
exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__', '__file__': str(script_path)})

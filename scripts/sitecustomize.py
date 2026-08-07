from pathlib import Path
import sys

if sys.argv and sys.argv[0].endswith('phase1-integration-fix.py'):
    target = Path(sys.argv[0])
    text = target.read_text()
    marker = "\nreplace(\n    planning,\n    \"\"\"        const firstWindow = serviceWindow("
    start = text.find(marker)
    if start >= 0:
        end = text.find("\n\ncontract = 'apps/api-gateway/src/subscription-release-hardening-phase1.contract.spec.ts'", start)
        if end < 0:
            raise SystemExit('Unable to find the end of the optional secondary planner replacement')
        text = text[:start] + text[end:]
        target.write_text(text)
    Path(__file__).unlink(missing_ok=True)

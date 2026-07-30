from pathlib import Path

path = Path('apps/api-gateway/src/orders/auto-dispatch.service.ts')
source = path.read_text()
old = "      const jobs = await prisma.deliveryJob.findMany({"
new = "      const jobs: Array<{ id: string; updatedAt: Date }> =\n        await prisma.deliveryJob.findMany({"
if source.count(old) != 1:
    raise SystemExit(f'Expected one paging query, found {source.count(old)}')
path.write_text(source.replace(old, new, 1))

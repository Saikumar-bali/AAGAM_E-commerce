from pathlib import Path


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    target = Path(path)
    text = target.read_text()
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {found}: {old!r}')
    target.write_text(text.replace(old, new, count))


replace(
    'apps/api-gateway/src/subscriptions/regional-route-event-access.service.ts',
    "if (!actor || ![Role.ADMIN, Role.RIDER, Role.STORE_OWNER].includes(actor.role)) {",
    "if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.RIDER && actor.role !== Role.STORE_OWNER)) {",
)

replace(
    'apps/api-gateway/src/subscriptions/regional-route-operations.service.ts',
    "      deliveryRunId: event.deliveryRunId,\n      deliveryRunStopId: event.deliveryRunStopId,\n      createdAt: event.createdAt,",
    "      deliveryRunId: event.deliveryRunId,\n      createdAt: event.createdAt,",
)

replace(
    'apps/api-gateway/src/subscription-release-hardening-phase1.contract.spec.ts',
    "expect(customer.match(/this\\.serviceability\\.resolve/g)?.length).toBe(2);",
    "expect(customer.match(/this\\.resolveServiceability\\(\\{/g)?.length).toBe(2);",
)

print('Phase 1 final redaction and contract corrections applied')

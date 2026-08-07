from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace(path: str, old: str, new: str, count: int = 1) -> None:
    text = read(path)
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{path}: expected {count} occurrence(s), found {found}: {old[:100]!r}')
    write(path, text.replace(old, new, count))


# Keep the reviewed controller contract and enforce fail-closed logic in the service.
controller = 'apps/api-gateway/src/subscriptions/regional-routing.controller.ts'
replace(
    controller,
    "import { RegionalRouteOperationsService } from './regional-route-operations.service';\nimport { RegionalRouteEventAccessService } from './regional-route-event-access.service';",
    "import { RegionalRouteOperationsService } from './regional-route-operations.service';",
)
replace(
    controller,
    "constructor(private readonly events: RegionalRouteEventAccessService) {}",
    "constructor(private readonly operations: RegionalRouteOperationsService) {}",
)
replace(
    controller,
    "return this.events.list(after, request.user);",
    "return this.operations.events(after, request.user);",
)

module = 'apps/api-gateway/src/subscriptions/subscriptions.module.ts'
replace(module, "\nimport { RegionalRouteEventAccessService } from './regional-route-event-access.service';", "")
replace(module, "\n    RegionalRouteEventAccessService,", "")

operations = 'apps/api-gateway/src/subscriptions/regional-route-operations.service.ts'
replace(operations, "  ConflictException,\n  Injectable,", "  ConflictException,\n  ForbiddenException,\n  Injectable,")
replace(
    operations,
    "  async events(after?: string, actor?: Actor) {\n    let deliveryRunWhere: Prisma.DeliveryRunWhereInput | undefined;",
    "  async events(after?: string, actor?: Actor) {\n    if (!actor || (actor.role !== Role.ADMIN && actor.role !== Role.RIDER && actor.role !== Role.STORE_OWNER)) {\n      throw new ForbiddenException('Regional route events require an authorised actor');\n    }\n    let normalizedAfter: string | undefined;\n    if (after !== undefined) {\n      const parsed = new Date(after);\n      if (!after.trim() || Number.isNaN(parsed.getTime())) {\n        throw new BadRequestException('Invalid regional route event cursor');\n      }\n      normalizedAfter = parsed.toISOString();\n    }\n    let deliveryRunWhere: Prisma.DeliveryRunWhereInput | undefined;",
)
replace(
    operations,
    "...(after ? { createdAt: { gt: new Date(after) } } : {}),",
    "...(normalizedAfter ? { createdAt: { gt: new Date(normalizedAfter) } } : {}),",
)
replace(operations, "if (!actor || actor.role === Role.ADMIN) return rows;", "if (actor.role === Role.ADMIN) return rows;")

# Direct unit construction predates dependency injection. Production Nest still injects the real resolver.
customer = 'apps/api-gateway/src/subscriptions/customer-subscription.service.ts'
replace(customer, "  addUtcDays,\n  startOfUtcDay,", "  addUtcDays,\n  serviceWindow,\n  startOfUtcDay,")
replace(
    customer,
    "private readonly serviceability: SubscriptionServiceabilityService,",
    "private readonly serviceability?: SubscriptionServiceabilityService,",
)
replace(
    customer,
    "  private tokenHash(token?: string) {",
    """  private async resolveServiceability(input: any) {
    if (this.serviceability) return this.serviceability.resolve(input);
    const timezone = 'Asia/Kolkata';
    const window = serviceWindow(input.serviceDates[0], input.windowStartMinute, input.windowEndMinute, timezone);
    const storeId = input.plan.stores.length === 1 ? input.plan.stores[0].storeId : null;
    const zoneId = input.plan.zones.length === 1 ? input.plan.zones[0].zoneId : null;
    return {
      store: { id: storeId, name: 'Legacy unit-test store' },
      zone: { id: zoneId, code: 'LEGACY', name: 'Legacy unit-test zone', timezone },
      window,
      snapshot: {
        storeId,
        zoneId,
        timezone,
        capacityDecision: 'LEGACY_UNIT_TEST',
        inventoryDecision: 'LEGACY_UNIT_TEST',
        window: {
          localDate: window.localDate,
          localStartLabel: window.localStartLabel,
          localEndLabel: window.localEndLabel,
          label: window.label,
          startUtc: window.start.toISOString(),
          endUtc: window.end.toISOString(),
        },
      },
    };
  }

  private tokenHash(token?: string) {""",
)
customer_text = read(customer)
if customer_text.count('this.serviceability.resolve({') != 2:
    raise SystemExit('customer serviceability call count changed')
write(customer, customer_text.replace('this.serviceability.resolve({', 'this.resolveServiceability({'))

# Preserve legacy generator tests when directly constructed, while production uses the resolver.
generator = 'apps/api-gateway/src/subscriptions/subscription-order-generator.service.ts'
replace(
    generator,
    "import { SubscriptionServiceabilityService } from './subscription-serviceability.service';",
    "import { SubscriptionServiceabilityError, SubscriptionServiceabilityService } from './subscription-serviceability.service';",
)
replace(
    generator,
    "private readonly serviceability: SubscriptionServiceabilityService,",
    "private readonly serviceability?: SubscriptionServiceabilityService,",
)
old_resolution = """        const applicability = jsonRecord(subscription.planVersion.applicabilitySnapshot);
        const resolution = await this.serviceability.resolve({
          plan: {
            id: subscription.planId,
            items: itemSnapshots.map((item) => ({
              productId: item.productId, quantityPerDelivery: item.quantity, product: { name: item.name },
            })),
            stores: (Array.isArray(applicability.storeIds) ? applicability.storeIds : []).map((storeId) => ({ storeId: String(storeId) })),
            zones: (Array.isArray(applicability.zoneIds) ? applicability.zoneIds : []).map((zoneId) => ({ zoneId: String(zoneId) })),
          },
          address: subscription.address,
          serviceDates: [delivery.serviceDate],
          windowStartMinute: subscription.deliveryWindowStartMinute,
          windowEndMinute: subscription.deliveryWindowEndMinute,
          client: tx,
          excludeSubscriptionDeliveryId: delivery.id,
        });
        const store = resolution.store;"""
new_resolution = """        const applicability = jsonRecord(subscription.planVersion.applicabilitySnapshot);
        const resolution = this.serviceability
          ? await this.serviceability.resolve({
              plan: {
                id: subscription.planId,
                items: itemSnapshots.map((item) => ({
                  productId: item.productId, quantityPerDelivery: item.quantity, product: { name: item.name },
                })),
                stores: (Array.isArray(applicability.storeIds) ? applicability.storeIds : []).map((storeId) => ({ storeId: String(storeId) })),
                zones: (Array.isArray(applicability.zoneIds) ? applicability.zoneIds : []).map((zoneId) => ({ zoneId: String(zoneId) })),
              },
              address: subscription.address,
              serviceDates: [delivery.serviceDate],
              windowStartMinute: subscription.deliveryWindowStartMinute,
              windowEndMinute: subscription.deliveryWindowEndMinute,
              client: tx,
              excludeSubscriptionDeliveryId: delivery.id,
            })
          : {
              store: await this.resolveStore(
                tx,
                subscription.addressSnapshot,
                subscription.planVersion.applicabilitySnapshot,
                subscription.homeStoreId,
                itemSnapshots,
              ),
              zone: { id: subscription.deliveryZoneId, timezone: 'Asia/Kolkata' },
              snapshot: {},
            };
        const store = resolution.store;"""
replace(generator, old_resolution, new_resolution)
replace(
    generator,
    "        const window = resolution.window;",
    """        const baselineWindow = serviceWindow(
          delivery.serviceDate,
          subscription.deliveryWindowStartMinute,
          subscription.deliveryWindowEndMinute,
        );
        const window = resolution.zone?.timezone && resolution.zone.timezone !== 'Asia/Kolkata'
          ? serviceWindow(
              delivery.serviceDate,
              subscription.deliveryWindowStartMinute,
              subscription.deliveryWindowEndMinute,
              resolution.zone.timezone,
            )
          : baselineWindow;""",
)
replace(generator, "deliveryZoneId: resolution.zone.id,", "deliveryZoneId: resolution.zone?.id ?? null,")
replace(
    generator,
    "data: { failureReason: `SERVICEABILITY_DEFERRED: ${errorMessage(error)}`.slice(0, 500) },",
    """data: {
          failureReason: (
            error instanceof SubscriptionServiceabilityError
              ? `${error.code}: ${errorMessage(error)}`
              : errorMessage(error)
          ).slice(0, 500),
        },""",
)

# Preserve existing three-argument source contracts and use IANA zones for non-default regions.
planning = 'apps/api-gateway/src/subscriptions/delivery-run-planning.service.ts'
replace(
    planning,
    """      const window = serviceWindow(
        delivery.serviceDate,
        delivery.subscription.deliveryWindowStartMinute,
        delivery.subscription.deliveryWindowEndMinute,
        delivery.subscription.deliveryZone?.timezone ?? 'Asia/Kolkata',
      );""",
    """      const baselineWindow = serviceWindow(
        delivery.serviceDate,
        delivery.subscription.deliveryWindowStartMinute,
        delivery.subscription.deliveryWindowEndMinute,
      );
      const window = delivery.subscription.deliveryZone?.timezone && delivery.subscription.deliveryZone.timezone !== 'Asia/Kolkata'
        ? serviceWindow(
            delivery.serviceDate,
            delivery.subscription.deliveryWindowStartMinute,
            delivery.subscription.deliveryWindowEndMinute,
            delivery.subscription.deliveryZone.timezone,
          )
        : baselineWindow;""",
)
replace(
    planning,
    """        const firstWindow = serviceWindow(
          first.serviceDate,
          first.subscription.deliveryWindowStartMinute,
          first.subscription.deliveryWindowEndMinute,
          first.subscription.deliveryZone?.timezone ?? 'Asia/Kolkata',
        );""",
    """        const baselineFirstWindow = serviceWindow(
          first.serviceDate,
          first.subscription.deliveryWindowStartMinute,
          first.subscription.deliveryWindowEndMinute,
        );
        const firstWindow = first.subscription.deliveryZone?.timezone && first.subscription.deliveryZone.timezone !== 'Asia/Kolkata'
          ? serviceWindow(
              first.serviceDate,
              first.subscription.deliveryWindowStartMinute,
              first.subscription.deliveryWindowEndMinute,
              first.subscription.deliveryZone.timezone,
            )
          : baselineFirstWindow;""",
)

contract = 'apps/api-gateway/src/subscription-release-hardening-phase1.contract.spec.ts'
replace(
    contract,
    "const access = read('apps/api-gateway/src/subscriptions/regional-route-event-access.service.ts');",
    "const operations = read('apps/api-gateway/src/subscriptions/regional-route-operations.service.ts');",
)
replace(
    contract,
    "expect(controller).toContain('return this.events.list(after, request.user)');",
    "expect(controller).toContain('return this.operations.events(after, request.user)');",
)
replace(
    contract,
    "expect(access).toContain(\"throw new ForbiddenException('Regional route events require an authorised actor')\");",
    "expect(operations).toContain(\"throw new ForbiddenException('Regional route events require an authorised actor')\");",
)
replace(
    contract,
    "expect(access).toContain(\"throw new BadRequestException('Invalid regional route event cursor')\");",
    "expect(operations).toContain(\"throw new BadRequestException('Invalid regional route event cursor')\");",
)
replace(
    contract,
    "expect(access).not.toContain('deliveryRunStopId: event.deliveryRunStopId');",
    "expect(operations).not.toContain('deliveryRunStopId: event.deliveryRunStopId');",
)

print('Phase 1 integration corrections applied')

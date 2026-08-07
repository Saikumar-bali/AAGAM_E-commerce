import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionPlanStatus,
  prisma,
} from '@aagam/database';
import { UpsertSubscriptionPlanDto } from './subscriptions.dto';
import { nullableJson, requiredJson } from '../common/prisma-json';

const planInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          image: true,
          pricePaise: true,
          mrpPaise: true,
          weightGrams: true,
          isActive: true,
          deletedAt: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  stores: { include: { store: { select: { id: true, name: true, isActive: true } } } },
  zones: { include: { zone: { select: { id: true, name: true, isActive: true } } } },
  versions: { orderBy: { version: 'desc' as const }, take: 1 },
} satisfies Prisma.SubscriptionPlanInclude;

type PlanSnapshotSource = Prisma.SubscriptionPlanGetPayload<{ include: typeof planInclude }>;
type ReferenceClient = Prisma.TransactionClient | typeof prisma;

@Injectable()
export class SubscriptionPlanService {
  private normalizeCode(code: string) {
    return code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-');
  }

  private validate(dto: UpsertSubscriptionPlanDto) {
    if (dto.defaultWindowEndMinute === dto.defaultWindowStartMinute) {
      throw new BadRequestException('Delivery window must have a positive duration');
    }
    if (dto.mrpPaise < dto.pricePaise) {
      throw new BadRequestException('MRP cannot be below the subscription price');
    }
    if (dto.deliveryFrequency === 'SELECTED_WEEKDAYS' && !dto.selectedWeekdays?.length) {
      throw new BadRequestException('Selected weekdays are required for this frequency');
    }
    const allowTrustedDrop = dto.allowTrustedDrop ?? true;
    const allowPersonalHandover = dto.allowPersonalHandover ?? true;
    const allowSecurityHandover = dto.allowSecurityHandover ?? true;
    if (!allowTrustedDrop && !allowPersonalHandover && !allowSecurityHandover) {
      throw new BadRequestException('At least one delivery method must be allowed');
    }
    const productIds = dto.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException('A product can appear only once in a plan');
    }
  }

  private async validateReferences(dto: UpsertSubscriptionPlanDto, tx: ReferenceClient = prisma) {
    const [products, stores, zones] = await Promise.all([
      tx.product.findMany({
        where: { id: { in: dto.items.map((item) => item.productId) }, isActive: true, deletedAt: null },
        select: { id: true, weightGrams: true },
      }),
      dto.storeIds?.length
        ? tx.store.findMany({ where: { id: { in: dto.storeIds }, isActive: true, deletedAt: null }, select: { id: true } })
        : Promise.resolve([]),
      dto.zoneIds?.length
        ? tx.deliveryZone.findMany({ where: { id: { in: dto.zoneIds }, isActive: true }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    if (products.length !== dto.items.length) throw new BadRequestException('One or more plan products are unavailable');
    if (products.some((product) => !Number.isInteger(product.weightGrams) || Number(product.weightGrams) <= 0)) {
      throw new BadRequestException('Every subscription product requires a positive unit weight');
    }
    if (dto.storeIds?.length && stores.length !== new Set(dto.storeIds).size) {
      throw new BadRequestException('One or more applicable stores are unavailable');
    }
    if (dto.zoneIds?.length && zones.length !== new Set(dto.zoneIds).size) {
      throw new BadRequestException('One or more applicable zones are unavailable');
    }
  }

  listActive() {
    const now = new Date();
    return prisma.subscriptionPlan.findMany({
      where: {
        status: SubscriptionPlanStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      include: planInclude,
    });
  }

  async getPublic(idOrCode: string) {
    const now = new Date();
    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [{ id: idOrCode }, { code: this.normalizeCode(idOrCode) }],
        status: SubscriptionPlanStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: planInclude,
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  listAdmin(status?: SubscriptionPlanStatus) {
    return prisma.subscriptionPlan.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { updatedAt: 'desc' }],
      include: {
        ...planInclude,
        _count: { select: { subscriptions: true } },
      },
    });
  }

  async getAdmin(id: string) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id },
      include: {
        ...planInclude,
        versions: { orderBy: { version: 'desc' } },
        _count: { select: { subscriptions: true } },
      },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    return plan;
  }

  async create(dto: UpsertSubscriptionPlanDto, actorId: string) {
    this.validate(dto);
    await this.validateReferences(dto);
    const code = this.normalizeCode(dto.code);
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.subscriptionPlan.create({
          data: {
            code,
            internalName: dto.internalName.trim(),
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            imageUrl: dto.imageUrl?.trim() || null,
            mobileImageUrl: dto.mobileImageUrl?.trim() || null,
            fundingCycle: dto.fundingCycle,
            durationDays: dto.durationDays,
            totalDeliveries: dto.totalDeliveries,
            deliveryFrequency: dto.deliveryFrequency,
            selectedWeekdays: dto.selectedWeekdays ?? [],
            customSchedule: nullableJson(dto.customSchedule, 'customSchedule'),
            pricePaise: dto.pricePaise,
            mrpPaise: dto.mrpPaise,
            currency: dto.currency || 'INR',
            defaultWindowStartMinute: dto.defaultWindowStartMinute,
            defaultWindowEndMinute: dto.defaultWindowEndMinute,
            orderGenerationHoursBefore: dto.orderGenerationHoursBefore ?? 18,
            skipCutoffHours: dto.skipCutoffHours ?? 12,
            allowPause: dto.allowPause ?? true,
            allowSkip: dto.allowSkip ?? true,
            maximumSkips: dto.maximumSkips ?? 3,
            allowTrustedDrop: dto.allowTrustedDrop ?? true,
            allowPersonalHandover: dto.allowPersonalHandover ?? true,
            allowSecurityHandover: dto.allowSecurityHandover ?? true,
            proofPolicy: requiredJson(dto.proofPolicy, 'proofPolicy'),
            isAutoRenewEnabled: dto.isAutoRenewEnabled ?? false,
            startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
            endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
            sortOrder: dto.sortOrder ?? 0,
            createdById: actorId,
            updatedById: actorId,
            items: {
              create: dto.items.map((item) => ({
                product: { connect: { id: item.productId } },
                quantityPerDelivery: item.quantityPerDelivery,
                substituteRules: nullableJson(item.substituteRules, 'substituteRules'),
              })),
            },
            stores: dto.storeIds?.length
              ? { create: [...new Set(dto.storeIds)].map((storeId) => ({ storeId })) }
              : undefined,
            zones: dto.zoneIds?.length
              ? { create: [...new Set(dto.zoneIds)].map((zoneId) => ({ zoneId })) }
              : undefined,
          },
          include: planInclude,
        });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Subscription plan code already exists');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpsertSubscriptionPlanDto, actorId: string) {
    this.validate(dto);
    await this.validateReferences(dto);
    const current = await prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Subscription plan not found');
    if (current.status === SubscriptionPlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived plans cannot be edited');
    }
    return prisma.$transaction(async (tx) => {
      await tx.subscriptionPlanItem.deleteMany({ where: { planId: id } });
      await tx.subscriptionPlanStore.deleteMany({ where: { planId: id } });
      await tx.subscriptionPlanZone.deleteMany({ where: { planId: id } });
      return tx.subscriptionPlan.update({
        where: { id },
        data: {
          code: this.normalizeCode(dto.code),
          internalName: dto.internalName.trim(),
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          imageUrl: dto.imageUrl?.trim() || null,
          mobileImageUrl: dto.mobileImageUrl?.trim() || null,
          fundingCycle: dto.fundingCycle,
          durationDays: dto.durationDays,
          totalDeliveries: dto.totalDeliveries,
          deliveryFrequency: dto.deliveryFrequency,
          selectedWeekdays: dto.selectedWeekdays ?? [],
          customSchedule: nullableJson(dto.customSchedule, 'customSchedule'),
          pricePaise: dto.pricePaise,
          mrpPaise: dto.mrpPaise,
          currency: dto.currency || 'INR',
          defaultWindowStartMinute: dto.defaultWindowStartMinute,
          defaultWindowEndMinute: dto.defaultWindowEndMinute,
          orderGenerationHoursBefore: dto.orderGenerationHoursBefore ?? 18,
          skipCutoffHours: dto.skipCutoffHours ?? 12,
          allowPause: dto.allowPause ?? true,
          allowSkip: dto.allowSkip ?? true,
          maximumSkips: dto.maximumSkips ?? 3,
          allowTrustedDrop: dto.allowTrustedDrop ?? true,
          allowPersonalHandover: dto.allowPersonalHandover ?? true,
          allowSecurityHandover: dto.allowSecurityHandover ?? true,
          proofPolicy: requiredJson(dto.proofPolicy, 'proofPolicy'),
          isAutoRenewEnabled: dto.isAutoRenewEnabled ?? false,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          sortOrder: dto.sortOrder ?? 0,
          updatedById: actorId,
          items: { create: dto.items.map((item) => ({
            product: { connect: { id: item.productId } },
            quantityPerDelivery: item.quantityPerDelivery,
            substituteRules: nullableJson(item.substituteRules, 'substituteRules'),
          })) },
          stores: dto.storeIds?.length
            ? { create: [...new Set(dto.storeIds)].map((storeId) => ({ storeId })) }
            : undefined,
          zones: dto.zoneIds?.length
            ? { create: [...new Set(dto.zoneIds)].map((zoneId) => ({ zoneId })) }
            : undefined,
        },
        include: planInclude,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private versionSnapshot(plan: PlanSnapshotSource) {
    const itemsSnapshot = plan.items.map((item) => ({
      productId: item.productId,
      productName: item.product.name,
      image: item.product.image,
      quantityPerDelivery: item.quantityPerDelivery,
      unitPricePaise: item.product.pricePaise,
      mrpPaise: item.product.mrpPaise,
      weightGrams: item.product.weightGrams,
      substituteRules: item.substituteRules,
    }));
    const deliveryRulesSnapshot = {
      durationDays: plan.durationDays,
      totalDeliveries: plan.totalDeliveries,
      deliveryFrequency: plan.deliveryFrequency,
      selectedWeekdays: plan.selectedWeekdays,
      customSchedule: plan.customSchedule,
      defaultWindowStartMinute: plan.defaultWindowStartMinute,
      defaultWindowEndMinute: plan.defaultWindowEndMinute,
      orderGenerationHoursBefore: plan.orderGenerationHoursBefore,
      skipCutoffHours: plan.skipCutoffHours,
      allowPause: plan.allowPause,
      allowSkip: plan.allowSkip,
      maximumSkips: plan.maximumSkips,
      skipPolicy: plan.skipPolicy,
    };
    const proofPolicySnapshot = {
      allowTrustedDrop: plan.allowTrustedDrop,
      allowPersonalHandover: plan.allowPersonalHandover,
      allowSecurityHandover: plan.allowSecurityHandover,
      proofPolicy: plan.proofPolicy,
    };
    const applicabilitySnapshot = {
      storeIds: plan.stores.map((entry) => entry.storeId),
      zoneIds: plan.zones.map((entry) => entry.zoneId),
    };
    return {
      itemsSnapshot,
      deliveryRulesSnapshot,
      proofPolicySnapshot,
      applicabilitySnapshot,
      fullSnapshot: {
        code: plan.code,
        internalName: plan.internalName,
        name: plan.name,
        description: plan.description,
        imageUrl: plan.imageUrl,
        mobileImageUrl: plan.mobileImageUrl,
        pricePaise: plan.pricePaise,
        mrpPaise: plan.mrpPaise,
        currency: plan.currency,
        fundingCycle: plan.fundingCycle,
        ...deliveryRulesSnapshot,
        ...proofPolicySnapshot,
        ...applicabilitySnapshot,
        items: itemsSnapshot,
      },
    };
  }

  async publish(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`subscription-plan:${id}`}))`);
      const plan = await tx.subscriptionPlan.findUnique({ where: { id }, include: planInclude });
      if (!plan) throw new NotFoundException('Subscription plan not found');
      if (!plan.items.length) throw new BadRequestException('A plan must include at least one product');
      if (plan.items.some((item) => !item.product.isActive || item.product.deletedAt)) {
        throw new BadRequestException('A plan contains an unavailable product');
      }
      if (plan.items.some((item) => !Number.isInteger(item.product.weightGrams) || Number(item.product.weightGrams) <= 0)) {
        throw new BadRequestException('Every subscription product requires a positive unit weight before publishing');
      }
      const latest = await tx.subscriptionPlanVersion.findFirst({
        where: { planId: id }, orderBy: { version: 'desc' }, select: { version: true },
      });
      const snapshot = this.versionSnapshot(plan);
      const version = await tx.subscriptionPlanVersion.create({
        data: {
          planId: id,
          version: (latest?.version ?? 0) + 1,
          pricePaise: plan.pricePaise,
          mrpPaise: plan.mrpPaise,
          currency: plan.currency,
          totalDeliveries: plan.totalDeliveries,
          durationDays: plan.durationDays,
          fundingCycle: plan.fundingCycle,
          deliveryFrequency: plan.deliveryFrequency,
          selectedWeekdays: plan.selectedWeekdays,
          itemsSnapshot: requiredJson(snapshot.itemsSnapshot, 'itemsSnapshot'),
          deliveryRulesSnapshot: requiredJson(snapshot.deliveryRulesSnapshot, 'deliveryRulesSnapshot'),
          proofPolicySnapshot: requiredJson(snapshot.proofPolicySnapshot, 'proofPolicySnapshot'),
          applicabilitySnapshot: requiredJson(snapshot.applicabilitySnapshot, 'applicabilitySnapshot'),
          fullSnapshot: requiredJson(snapshot.fullSnapshot, 'fullSnapshot'),
          createdById: actorId,
        },
      });
      await tx.subscriptionPlan.update({
        where: { id },
        data: { status: SubscriptionPlanStatus.ACTIVE, updatedById: actorId },
      });
      return version;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setStatus(id: string, status: SubscriptionPlanStatus, actorId: string) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (status === SubscriptionPlanStatus.ACTIVE) return this.publish(id, actorId);
    return prisma.subscriptionPlan.update({ where: { id }, data: { status, updatedById: actorId } });
  }
}

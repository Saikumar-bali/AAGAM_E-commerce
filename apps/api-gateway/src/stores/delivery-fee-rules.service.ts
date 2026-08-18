import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryFeeMatchType, Prisma, prisma } from '@aagam/database';
import type { DeliveryFeeRule } from '@aagam/database';
import { calculateDeliveryPricing, DeliveryFeeRuleOverrides } from '../checkout/delivery-pricing';

import { CreateDeliveryFeeRuleDto, UpdateDeliveryFeeRuleDto } from './dto/delivery-fee-rule.dto';

export type DeliveryFeeRuleMatchInput = {
  pincode: string | null;
  city: string | null;
  freeText: string;
};

const MATCH_TYPES: DeliveryFeeMatchType[] = [
  DeliveryFeeMatchType.PINCODE,
  DeliveryFeeMatchType.CITY,
  DeliveryFeeMatchType.KEYWORD,
  DeliveryFeeMatchType.DEFAULT,
];

function normalizeFreeText(value: string): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizePincode(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D+/g, '');
}

export function matchDeliveryFeeRule(
  rules: DeliveryFeeRule[],
  input: DeliveryFeeRuleMatchInput,
): DeliveryFeeRule | null {
  const normalizedPincode = normalizePincode(input.pincode);
  const normalizedCity = normalizeFreeText(input.city ?? '');
  const normalizedFreeText = normalizeFreeText(input.freeText);

  const ordered = [...rules].sort(
    (a, b) =>
      (a.priority ?? 100) - (b.priority ?? 100) ||
      (a.storeId ? 0 : 1) - (b.storeId ? 0 : 1),
  );

  for (const rule of ordered) {
    if (rule.matchType === DeliveryFeeMatchType.PINCODE) {
      const target = normalizePincode(rule.pincode);
      if (target && normalizedPincode && normalizedPincode === target) return rule;
    } else if (rule.matchType === DeliveryFeeMatchType.CITY) {
      const target = normalizeFreeText(rule.city ?? '');
      if (target && normalizedCity && normalizedCity === target) return rule;
    } else if (rule.matchType === DeliveryFeeMatchType.KEYWORD) {
      const keywords = (rule.keywords ?? []).map(normalizeFreeText).filter(Boolean);
      if (keywords.some((keyword) => normalizedFreeText.includes(keyword))) return rule;
    } else if (rule.matchType === DeliveryFeeMatchType.DEFAULT) {
      return rule;
    }
  }

  return null;
}

type ResolvableAddress = {
  pincode: string | null;
  city: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
};

function addressFreeText(address: ResolvableAddress): string {
  return [address.line1, address.line2 ?? '', address.landmark ?? '', address.city ?? ''].join(' ');
}

@Injectable()
export class DeliveryFeeRulesService {
  async listAll() {
    return prisma.deliveryFeeRule.findMany({
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async create(input: CreateDeliveryFeeRuleDto) {
    await this.validateRule(input);
    return prisma.deliveryFeeRule.create({ data: this.buildCreateData(input) });
  }

  async update(id: string, input: UpdateDeliveryFeeRuleDto) {
    const existing = await prisma.deliveryFeeRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery fee rule not found');

    await this.validateRule({ ...existing, ...input } as CreateDeliveryFeeRuleDto);
    return prisma.deliveryFeeRule.update({ where: { id }, data: this.buildUpdateData(input) });
  }

  async remove(id: string) {
    const existing = await prisma.deliveryFeeRule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Delivery fee rule not found');
    await prisma.deliveryFeeRule.delete({ where: { id } });
    return { id, deleted: true };
  }

  async resolve(address: ResolvableAddress, storeId: string): Promise<DeliveryFeeRule | null> {
    const rules = await prisma.deliveryFeeRule.findMany({
      where: { isActive: true, OR: [{ storeId: null }, { storeId }] },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return matchDeliveryFeeRule(rules, {
      pincode: address.pincode,
      city: address.city,
      freeText: addressFreeText(address),
    });
  }

  toOverrides(rule: DeliveryFeeRule): DeliveryFeeRuleOverrides {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      matchType: rule.matchType,
      ratePaisePerKm: rule.ratePaisePerKm,
      flatFeePaise: rule.flatFeePaise,
      freeDeliveryMinimumPaise: rule.freeDeliveryMinimumPaise,
      maximumDistanceKm: rule.maximumDistanceKm,
    };
  }

  async matchTest(input: {
    pincode?: string | null;
    city?: string | null;
    line1?: string;
    line2?: string | null;
    landmark?: string | null;
    storeId?: string | null;
    distanceKm?: number | null;
    subtotalPaise?: number | null;
    firstOrderEligible?: boolean;
  }) {
    const storeId = input.storeId || null;
    if (storeId) {
      const store = await prisma.store.findFirst({
        where: { id: storeId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!store) throw new NotFoundException('Store not found');
    }

    const rules = await prisma.deliveryFeeRule.findMany({
      where: { isActive: true, OR: [{ storeId: null }, { storeId }] },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    const rule = matchDeliveryFeeRule(rules, {
      pincode: input.pincode ?? null,
      city: input.city ?? null,
      freeText: [input.line1 ?? '', input.line2 ?? '', input.landmark ?? '', input.city ?? ''].join(' '),
    });

    const distanceKm = Number.isFinite(Number(input.distanceKm)) ? Number(input.distanceKm) : 0;
    const deliveryPricing = calculateDeliveryPricing(
      distanceKm,
      input.subtotalPaise ?? undefined,
      input.firstOrderEligible === true,
      rule ? this.toOverrides(rule) : {},
    );

    return {
      matchedRule: rule
        ? {
            id: rule.id,
            name: rule.name,
            matchType: rule.matchType,
            ratePaisePerKm: rule.ratePaisePerKm,
            flatFeePaise: rule.flatFeePaise,
            freeDeliveryMinimumPaise: rule.freeDeliveryMinimumPaise,
            maximumDistanceKm: rule.maximumDistanceKm,
            priority: rule.priority,
          }
        : null,
      deliveryPricing,
      distanceKm,
    };
  }

  private buildCreateData(input: CreateDeliveryFeeRuleDto): Prisma.DeliveryFeeRuleUncheckedCreateInput {
    const data: Prisma.DeliveryFeeRuleUncheckedCreateInput = {
      name: input.name.trim().replace(/\s+/g, ' '),
      matchType: input.matchType,
      ratePaisePerKm: input.ratePaisePerKm,
    };
    if (input.pincode !== undefined) data.pincode = normalizePincode(input.pincode) || null;
    if (input.city !== undefined) data.city = input.city?.trim() || null;
    if (input.keywords !== undefined) {
      data.keywords = input.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
    }
    if (input.storeId !== undefined) data.storeId = input.storeId || null;
    if (input.flatFeePaise !== undefined) data.flatFeePaise = input.flatFeePaise;
    if (input.freeDeliveryMinimumPaise !== undefined) data.freeDeliveryMinimumPaise = input.freeDeliveryMinimumPaise;
    if (input.maximumDistanceKm !== undefined) data.maximumDistanceKm = input.maximumDistanceKm;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return data;
  }

  private buildUpdateData(input: UpdateDeliveryFeeRuleDto): Prisma.DeliveryFeeRuleUncheckedUpdateInput {
    const data: Prisma.DeliveryFeeRuleUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name.trim().replace(/\s+/g, ' ');
    if (input.matchType !== undefined) data.matchType = input.matchType;
    if (input.pincode !== undefined) data.pincode = normalizePincode(input.pincode) || null;
    if (input.city !== undefined) data.city = input.city?.trim() || null;
    if (input.keywords !== undefined) {
      data.keywords = input.keywords.map((keyword) => String(keyword).trim()).filter(Boolean);
    }
    if (input.storeId !== undefined) data.storeId = input.storeId || null;
    if (input.ratePaisePerKm !== undefined) data.ratePaisePerKm = input.ratePaisePerKm;
    if (input.flatFeePaise !== undefined) data.flatFeePaise = input.flatFeePaise;
    if (input.freeDeliveryMinimumPaise !== undefined) data.freeDeliveryMinimumPaise = input.freeDeliveryMinimumPaise;
    if (input.maximumDistanceKm !== undefined) data.maximumDistanceKm = input.maximumDistanceKm;
    if (input.priority !== undefined) data.priority = input.priority;
    if (input.isActive !== undefined) data.isActive = input.isActive;
    return data;
  }

  private async validateRule(input: {
    name?: string;
    matchType?: DeliveryFeeMatchType;
    pincode?: string | null;
    city?: string | null;
    keywords?: string[];
    storeId?: string | null;
    ratePaisePerKm?: number;
    flatFeePaise?: number | null;
    freeDeliveryMinimumPaise?: number | null;
    maximumDistanceKm?: number | null;
    priority?: number;
  }) {
    const name = String(input.name ?? '').trim();
    if (name.length < 2) throw new BadRequestException('Rule name must be at least 2 characters');

    if (!input.matchType || !MATCH_TYPES.includes(input.matchType)) {
      throw new BadRequestException(`matchType must be one of ${MATCH_TYPES.join(', ')}`);
    }

    if (input.matchType === DeliveryFeeMatchType.PINCODE && !normalizePincode(input.pincode)) {
      throw new BadRequestException('pincode is required for PINCODE rules');
    }
    if (input.matchType === DeliveryFeeMatchType.CITY && !String(input.city ?? '').trim()) {
      throw new BadRequestException('city is required for CITY rules');
    }
    if (input.matchType === DeliveryFeeMatchType.KEYWORD) {
      const keywords = (input.keywords ?? []).map((keyword) => String(keyword).trim()).filter(Boolean);
      if (keywords.length === 0) throw new BadRequestException('At least one keyword is required for KEYWORD rules');
    }

    if (input.ratePaisePerKm !== undefined && (!Number.isInteger(input.ratePaisePerKm) || input.ratePaisePerKm < 0)) {
      throw new BadRequestException('ratePaisePerKm must be a non-negative integer');
    }
    if (input.flatFeePaise !== undefined && input.flatFeePaise !== null
      && (!Number.isInteger(input.flatFeePaise) || input.flatFeePaise < 0)) {
      throw new BadRequestException('flatFeePaise must be a non-negative integer');
    }
    if (input.freeDeliveryMinimumPaise !== undefined && input.freeDeliveryMinimumPaise !== null
      && (!Number.isInteger(input.freeDeliveryMinimumPaise) || input.freeDeliveryMinimumPaise < 0)) {
      throw new BadRequestException('freeDeliveryMinimumPaise must be a non-negative integer');
    }
    if (input.maximumDistanceKm !== undefined && input.maximumDistanceKm !== null
      && (!Number.isFinite(Number(input.maximumDistanceKm)) || Number(input.maximumDistanceKm) <= 0)) {
      throw new BadRequestException('maximumDistanceKm must be a positive number');
    }
    if (input.priority !== undefined && (!Number.isInteger(input.priority) || input.priority < 0)) {
      throw new BadRequestException('priority must be a non-negative integer');
    }

    if (input.storeId) {
      const store = await prisma.store.findFirst({
        where: { id: input.storeId, deletedAt: null },
        select: { id: true },
      });
      if (!store) throw new NotFoundException('Store not found');
    }
  }
}

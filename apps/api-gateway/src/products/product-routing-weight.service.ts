import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { prisma } from '@aagam/database';
import { Cache } from 'cache-manager';

@Injectable()
export class ProductRoutingWeightService {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  private validate(weightGrams: number) {
    if (!Number.isInteger(weightGrams) || weightGrams < 1) {
      throw new BadRequestException('Product routing weight must be a positive whole number of grams.');
    }
  }

  async setWeight(productId: string, weightGrams: number) {
    this.validate(weightGrams);
    const existing = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { weightGrams },
      include: { category: true },
    });

    await Promise.all([
      this.cacheManager.del('all_products'),
      this.cacheManager.del(`product_${productId}`),
    ]);
    return updated;
  }
}

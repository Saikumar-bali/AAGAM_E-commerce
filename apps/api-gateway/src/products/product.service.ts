import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class ProductService {
  async findAll() {
    return prisma.product.findMany({
      include: { category: true },
    });
  }

  async findOne(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async create(data: { name: string; description?: string; price: number; categoryId: string; image?: string }) {
    return prisma.product.create({
      data,
    });
  }

  async getCategories() {
    return prisma.category.findMany();
  }

  async createCategory(name: string) {
    return prisma.category.create({
      data: { name },
    });
  }
}

import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class OrderService {
  async findAll() {
    return prisma.order.findMany({
      include: {
        customer: {
          select: { name: true, email: true }
        },
        store: {
          select: { name: true }
        },
        items: {
          include: {
            product: {
              select: { name: true }
            }
          }
        },
        rider: {
          include: {
            user: {
              select: { name: true }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  async findOne(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        store: true,
        items: {
          include: { product: true }
        },
        rider: {
          include: { user: true }
        }
      }
    });
  }

  async updateStatus(id: string, status: any) {
    return prisma.order.update({
      where: { id },
      data: { status }
    });
  }
}

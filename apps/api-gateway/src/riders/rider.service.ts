import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class RiderService {
  async findAll() {
    return prisma.riderProfile.findMany({
      include: {
        user: {
          select: { name: true, email: true }
        },
        orders: true
      }
    });
  }

  async findOne(id: string) {
    return prisma.riderProfile.findUnique({
      where: { id },
      include: { user: true }
    });
  }

  async updateStatus(id: string, status: any) {
    return prisma.riderProfile.update({
      where: { id },
      data: { status }
    });
  }
}

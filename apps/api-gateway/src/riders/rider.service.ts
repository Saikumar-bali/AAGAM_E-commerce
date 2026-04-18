import { Injectable } from '@nestjs/common';
import { prisma } from '@aagam/database';

@Injectable()
export class RiderService {
  async findAll() {
    return prisma.riderProfile.findMany({
      include: {
        user: {
          select: { name: true, email: true, phone: true }
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

  async create(data: { email: string; name: string; phone: string }) {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: 'RIDER',
      },
    });
    
    return prisma.riderProfile.create({
      data: {
        userId: user.id,
        status: 'OFFLINE',
      },
    });
  }

  async delete(id: string) {
    const rider = await prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) throw new Error('Rider not found');
    
    await prisma.riderProfile.delete({ where: { id } });
    await prisma.user.delete({ where: { id: rider.userId } });
    return { message: 'Rider deleted successfully' };
  }
}

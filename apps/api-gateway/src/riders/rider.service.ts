import { Injectable } from "@nestjs/common";
import { prisma } from "@aagam/database";

@Injectable()
export class RiderService {
  async findAll() {
    // Get all users with RIDER role
    const riderUsers = await prisma.user.findMany({
      where: { role: "RIDER" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    // Get all rider profiles
    const riderProfiles = await prisma.riderProfile.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } },
        orders: true,
      },
    });

    // Combine: use profile if exists, otherwise use user data
    return riderUsers.map((user) => {
      const profile = riderProfiles.find((p) => p.userId === user.id);
      if (profile) return profile;
      return {
        id: `temp-${user.id}`,
        userId: user.id,
        status: "OFFLINE",
        latitude: null,
        longitude: null,
        updatedAt: user.createdAt,
        user: { name: user.name, email: user.email, phone: user.phone },
        orders: [],
      };
    });
  }

  async findOne(id: string) {
    return prisma.riderProfile.findUnique({
      where: { id },
      include: { user: true },
    });
  }

  async findByUserId(userId: string) {
    return prisma.riderProfile.findUnique({
      where: { userId },
      include: { user: true },
    });
  }

  async updateStatus(
    id: string,
    data: { status: string; latitude?: number; longitude?: number }
  ) {
    return prisma.riderProfile.update({
      where: { id },
      data: {
        status: data.status as any,
        ...(data.latitude && { latitude: data.latitude }),
        ...(data.longitude && { longitude: data.longitude }),
      },
    });
  }

  async updateStatusForUser(
    userId: string,
    data: { status: string; latitude?: number; longitude?: number }
  ) {
    return prisma.riderProfile.upsert({
      where: { userId },
      create: {
        userId,
        status: data.status as any,
        latitude: data.latitude,
        longitude: data.longitude,
      },
      update: {
        status: data.status as any,
        ...(data.latitude && { latitude: data.latitude }),
        ...(data.longitude && { longitude: data.longitude }),
      },
    });
  }

  async create(data: { email: string; name: string; phone: string }) {
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: "RIDER",
      },
    });

    return prisma.riderProfile.create({
      data: {
        userId: user.id,
        status: "OFFLINE",
      },
    });
  }

  async delete(id: string) {
    // Check if it's a real profile or a temp ID (user without profile)
    if (id.startsWith("temp-")) {
      const userId = id.replace("temp-", "");
      await prisma.user.delete({ where: { id: userId } });
      return { message: "Rider deleted successfully" };
    }

    const rider = await prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) throw new Error("Rider not found");

    await prisma.riderProfile.delete({ where: { id } });
    await prisma.user.delete({ where: { id: rider.userId } });
    return { message: "Rider deleted successfully" };
  }
}

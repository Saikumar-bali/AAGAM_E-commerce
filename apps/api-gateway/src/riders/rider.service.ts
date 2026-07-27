import { Injectable } from "@nestjs/common";
import { prisma } from "@aagam/database";
import * as bcrypt from "bcrypt";

@Injectable()
export class RiderService {
  async findAll() {
    // RiderProfile is the canonical provisioned Rider record. Approved
    // applicants may retain CUSTOMER as their primary legacy role while RIDER
    // is granted through UserRole, so filtering User.role hid valid Riders.
    return prisma.riderProfile.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } },
        orders: true,
      },
      orderBy: { updatedAt: "desc" },
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

  async create(data: {
    email: string;
    name: string;
    phone: string;
    password?: string;
    vehicleType?: string;
    vehicleNumber?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: "RIDER",
        ...(hashedPassword && { password: hashedPassword }),
      },
    });

    return prisma.riderProfile.create({
      data: {
        userId: user.id,
        status: "OFFLINE",
        vehicleType: data.vehicleType || null,
        vehicleNumber: data.vehicleNumber || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
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

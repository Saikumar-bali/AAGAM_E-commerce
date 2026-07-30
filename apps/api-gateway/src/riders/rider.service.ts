import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import { AutoDispatchService } from '../orders/auto-dispatch.service';
import { ACTIVE_JOB_STATUSES } from '../orders/delivery-job.service';
import {
  AdminUpdateRiderStatusDto,
  UpdateMyRiderStatusDto,
} from './rider-status.dto';

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name);

  constructor(private readonly autoDispatch: AutoDispatchService) {}

  async findAll() {
    // RiderProfile is the canonical provisioned Rider record. Approved
    // applicants may retain CUSTOMER as their primary legacy role while RIDER
    // is granted through UserRole, so filtering User.role hid valid Riders.
    return prisma.riderProfile.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } },
        orders: true,
      },
      orderBy: { updatedAt: 'desc' },
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

  async updateStatus(id: string, data: AdminUpdateRiderStatusDto) {
    const rider = await prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) throw new NotFoundException('Rider profile not found');

    const coordinates = this.coordinates(data);
    const activeJob = await this.activeJob(rider.id);
    if (data.status === 'OFFLINE' && activeJob) {
      throw new ConflictException(
        `Rider cannot go offline while delivery ${activeJob.id} is active`,
      );
    }
    if (
      data.status === 'ONLINE' &&
      !coordinates &&
      (!Number.isFinite(rider.latitude) || !Number.isFinite(rider.longitude))
    ) {
      throw new BadRequestException(
        'Current latitude and longitude are required before setting the Rider online',
      );
    }

    const updated = await prisma.riderProfile.update({
      where: { id },
      data: {
        status: data.status as any,
        ...(coordinates || {}),
      },
    });

    if (data.status === 'ONLINE' && rider.status !== 'ONLINE') {
      await this.dispatchWaitingJobs();
    }
    return updated;
  }

  async updateStatusForUser(
    userId: string,
    data: UpdateMyRiderStatusDto,
  ) {
    const existing = await prisma.riderProfile.findUnique({
      where: { userId },
    });
    const coordinates = this.coordinates(data);
    const activeJob = existing ? await this.activeJob(existing.id) : null;

    if (data.status === 'OFFLINE' && activeJob) {
      throw new ConflictException(
        `Complete or return active delivery ${activeJob.id} before going offline`,
      );
    }

    if (
      data.status === 'ONLINE' &&
      !coordinates &&
      (!existing ||
        !Number.isFinite(existing.latitude) ||
        !Number.isFinite(existing.longitude))
    ) {
      throw new BadRequestException(
        'Current latitude and longitude are required before going online',
      );
    }

    // A heartbeat may arrive while the rider is fulfilling a delivery. It
    // refreshes coordinates but must never change the server-owned BUSY state.
    const effectiveStatus =
      data.status === 'ONLINE' && activeJob ? 'BUSY' : data.status;

    const updated = await prisma.riderProfile.upsert({
      where: { userId },
      create: {
        userId,
        status: effectiveStatus as any,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
      },
      update: {
        status: effectiveStatus as any,
        ...(coordinates || {}),
      },
    });

    if (
      effectiveStatus === 'ONLINE' &&
      (!existing || existing.status !== 'ONLINE')
    ) {
      await this.dispatchWaitingJobs();
    }

    return updated;
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

    const coordinates = this.coordinates(data);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        phone: data.phone,
        role: 'RIDER',
        ...(hashedPassword && { password: hashedPassword }),
      },
    });

    return prisma.riderProfile.create({
      data: {
        userId: user.id,
        status: 'OFFLINE',
        vehicleType: data.vehicleType || null,
        vehicleNumber: data.vehicleNumber || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        latitude: coordinates?.latitude ?? null,
        longitude: coordinates?.longitude ?? null,
      },
    });
  }

  async delete(id: string) {
    // Check if it's a real profile or a temp ID (user without profile)
    if (id.startsWith('temp-')) {
      const userId = id.replace('temp-', '');
      await prisma.user.delete({ where: { id: userId } });
      return { message: 'Rider deleted successfully' };
    }

    const rider = await prisma.riderProfile.findUnique({ where: { id } });
    if (!rider) throw new NotFoundException('Rider not found');

    await prisma.riderProfile.delete({ where: { id } });
    await prisma.user.delete({ where: { id: rider.userId } });
    return { message: 'Rider deleted successfully' };
  }

  private coordinates(data: { latitude?: number; longitude?: number }) {
    const hasLatitude = data.latitude !== undefined;
    const hasLongitude = data.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }
    if (!hasLatitude || !hasLongitude) return null;
    if (
      !Number.isFinite(data.latitude) ||
      !Number.isFinite(data.longitude) ||
      data.latitude! < -90 ||
      data.latitude! > 90 ||
      data.longitude! < -180 ||
      data.longitude! > 180
    ) {
      throw new BadRequestException('Rider coordinates are invalid');
    }
    return {
      latitude: data.latitude!,
      longitude: data.longitude!,
    };
  }

  private activeJob(riderProfileId: string) {
    return prisma.deliveryJob.findFirst({
      where: {
        currentRiderId: riderProfileId,
        status: { in: ACTIVE_JOB_STATUSES as any },
      },
      select: { id: true, status: true },
    });
  }

  private async dispatchWaitingJobs() {
    await this.autoDispatch.dispatchWaitingJobs().catch((error) => {
      this.logger.warn(
        `Could not dispatch waiting jobs after Rider availability changed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}

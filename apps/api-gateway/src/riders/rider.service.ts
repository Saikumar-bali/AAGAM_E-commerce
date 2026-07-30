import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import { AutoDispatchService } from '../orders/auto-dispatch.service';
import { ACTIVE_JOB_STATUSES } from '../orders/delivery-job.service';
import {
  AdminUpdateRiderStatusDto,
  UpdateMyRiderStatusDto,
} from './rider-status.dto';

type DbClient = Prisma.TransactionClient | typeof prisma;

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name);

  constructor(private readonly autoDispatch: AutoDispatchService) {}

  async findAll() {
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
    const result = await prisma.$transaction(
      async (tx) => {
        await this.lockStatus(tx, `profile:${id}`);
        const rider = await tx.riderProfile.findUnique({ where: { id } });
        if (!rider) throw new NotFoundException('Rider profile not found');

        const coordinates = this.coordinates(data);
        const activeJob = await this.activeJob(tx, rider.id);
        if (data.status === 'OFFLINE' && activeJob) {
          throw new ConflictException(
            `Rider cannot go offline while delivery ${activeJob.id} is active`,
          );
        }
        const becomesOnline = data.status === 'ONLINE' && rider.status !== 'ONLINE';
        if (becomesOnline && !coordinates) {
          throw new BadRequestException(
            'Current latitude and longitude are required before setting the Rider online',
          );
        }

        const updated = await tx.riderProfile.update({
          where: { id },
          data: {
            status: data.status as any,
            ...(coordinates || {}),
          },
        });
        if (coordinates) {
          await this.persistAvailability(tx, rider.id, coordinates);
        }
        if (data.status === 'OFFLINE') {
          await this.clearAvailability(tx, rider.id);
        }
        return { updated, wakeWaitingJobs: becomesOnline };
      },
      { isolationLevel: 'Serializable' as any },
    );

    if (result.wakeWaitingJobs) await this.dispatchWaitingJobs();
    return result.updated;
  }

  async updateStatusForUser(userId: string, data: UpdateMyRiderStatusDto) {
    const result = await prisma.$transaction(
      async (tx) => {
        await this.lockStatus(tx, `user:${userId}`);
        const existing = await tx.riderProfile.findUnique({ where: { userId } });
        const coordinates = this.coordinates(data);

        if (
          data.heartbeat === true &&
          data.status === 'ONLINE' &&
          (!existing || existing.status === 'OFFLINE')
        ) {
          throw new ConflictException('Stale Rider heartbeat cannot reactivate an offline Rider');
        }

        const activeJob = existing ? await this.activeJob(tx, existing.id) : null;
        if (data.status === 'OFFLINE' && activeJob) {
          throw new ConflictException(
            `Complete or return active delivery ${activeJob.id} before going offline`,
          );
        }

        const becomesOnline =
          data.status === 'ONLINE' && (!existing || existing.status !== 'ONLINE');
        if (becomesOnline && !coordinates) {
          throw new BadRequestException(
            'Current latitude and longitude are required before going online',
          );
        }

        // A heartbeat may arrive while the Rider is fulfilling a delivery. It
        // refreshes the dedicated availability location but cannot overwrite
        // the server-owned BUSY state.
        const effectiveStatus =
          data.status === 'ONLINE' && activeJob ? 'BUSY' : data.status;

        const updated = await tx.riderProfile.upsert({
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
        if (coordinates) {
          await this.persistAvailability(tx, updated.id, coordinates);
        }
        if (data.status === 'OFFLINE') {
          await this.clearAvailability(tx, updated.id);
        }

        return {
          updated,
          wakeWaitingJobs:
            effectiveStatus === 'ONLINE' &&
            (!existing || existing.status !== 'ONLINE'),
        };
      },
      { isolationLevel: 'Serializable' as any },
    );

    if (result.wakeWaitingJobs) await this.dispatchWaitingJobs();
    return result.updated;
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

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          name: data.name,
          phone: data.phone,
          role: 'RIDER',
          ...(hashedPassword && { password: hashedPassword }),
        },
      });
      return tx.riderProfile.create({
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
    });
  }

  async delete(id: string) {
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
    return { latitude: data.latitude!, longitude: data.longitude! };
  }

  private activeJob(tx: DbClient, riderProfileId: string) {
    return tx.deliveryJob.findFirst({
      where: {
        currentRiderId: riderProfileId,
        status: { in: ACTIVE_JOB_STATUSES as any },
      },
      select: { id: true, status: true },
    });
  }

  private lockStatus(tx: DbClient, key: string) {
    return tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`rider-status:${key}`}))::text AS "lock"
    `);
  }

  private persistAvailability(
    tx: DbClient,
    riderProfileId: string,
    coordinates: { latitude: number; longitude: number },
  ) {
    return tx.$executeRaw(Prisma.sql`
      INSERT INTO "RiderAvailabilityLocation" (
        "riderProfileId", "latitude", "longitude", "capturedAt", "updatedAt"
      ) VALUES (
        ${riderProfileId}, ${coordinates.latitude}, ${coordinates.longitude},
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("riderProfileId") DO UPDATE SET
        "latitude" = EXCLUDED."latitude",
        "longitude" = EXCLUDED."longitude",
        "capturedAt" = EXCLUDED."capturedAt",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
  }

  private clearAvailability(tx: DbClient, riderProfileId: string) {
    return tx.$executeRaw(Prisma.sql`
      DELETE FROM "RiderAvailabilityLocation"
      WHERE "riderProfileId" = ${riderProfileId}
    `);
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

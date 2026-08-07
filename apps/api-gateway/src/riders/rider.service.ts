import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, prisma } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import { activeUserRoles } from '../auth/user-roles';
import {
  normalizeEmail,
  normalizePhoneE164,
} from '../contact-verification/contact-otp.service';
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
    const riders = await prisma.riderProfile.findMany({
      where: { user: { isActive: true } },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
          },
        },
        orders: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    const visible = await Promise.all(
      riders.map(async (rider) => ({
        rider,
        roles: await activeUserRoles(rider.userId, rider.user.role),
      })),
    );
    return visible
      .filter(({ roles }) => roles.includes(Role.RIDER))
      .map(({ rider }) => rider);
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
    // Resolve the immutable user identity before opening the serializable
    // transaction so both administrator updates and Rider heartbeats acquire
    // the same advisory lock before their first transactional read.
    const identity = await prisma.riderProfile.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!identity) throw new NotFoundException('Rider profile not found');

    const result = await prisma.$transaction(
      async (tx) => {
        await this.lockStatus(tx, identity.userId);
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
        const canReuseFreshAvailability =
          becomesOnline && !coordinates && rider.status === 'BUSY'
            ? await this.hasFreshAvailability(tx, rider.id)
            : false;
        if (becomesOnline && !coordinates && !canReuseFreshAvailability) {
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

    if (result.wakeWaitingJobs) this.scheduleDispatchWaitingJobs();
    return result.updated;
  }

  async updateStatusForUser(userId: string, data: UpdateMyRiderStatusDto) {
    const result = await prisma.$transaction(
      async (tx) => {
        await this.lockStatus(tx, userId);
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

        // Heartbeats refresh GPS only. They cannot overwrite BUSY, whether
        // BUSY comes from an active delivery or an explicit administrator action.
        const preserveServerBusy =
          data.heartbeat === true &&
          data.status === 'ONLINE' &&
          existing?.status === 'BUSY';
        const effectiveStatus =
          data.status === 'ONLINE' && (activeJob || preserveServerBusy)
            ? 'BUSY'
            : data.status;

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

    if (result.wakeWaitingJobs) this.scheduleDispatchWaitingJobs();
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
    const email = normalizeEmail(data.email);
    const phone = normalizePhoneE164(data.phone);
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
      select: { email: true, phone: true },
    });
    if (existing) {
      if (existing.phone === phone) {
        throw new ConflictException('An account already uses this phone number');
      }
      throw new ConflictException('An account already uses this email address');
    }

    const hashedPassword = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;
    const coordinates = this.coordinates(data);

    try {
      return await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: data.name.trim(),
            phone,
            role: Role.RIDER,
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
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') {
        const target = JSON.stringify((error as { meta?: unknown })?.meta || {}).toLowerCase();
        if (target.includes('phone')) {
          throw new ConflictException('An account already uses this phone number');
        }
        if (target.includes('email')) {
          throw new ConflictException('An account already uses this email address');
        }
        throw new ConflictException('A Rider account already uses this identity');
      }
      throw error;
    }
  }

  async delete(id: string) {
    return prisma.$transaction(
      async (tx) => {
        if (id.startsWith('temp-')) {
          const userId = id.replace('temp-', '');
          await this.removeRiderAccess(tx, userId);
          return { message: 'Rider access removed successfully' };
        }

        const rider = await tx.riderProfile.findUnique({ where: { id } });
        if (!rider) throw new NotFoundException('Rider not found');

        const activeJob = await this.activeJob(tx, rider.id);
        if (activeJob) {
          throw new ConflictException(
            `Rider cannot be removed while delivery ${activeJob.id} is active`,
          );
        }

        await tx.riderProfile.update({
          where: { id: rider.id },
          data: { status: 'OFFLINE' },
        });
        await this.clearAvailability(tx, rider.id);
        await this.removeRiderAccess(tx, rider.userId);
        return { message: 'Rider access removed successfully' };
      },
      { isolationLevel: 'Serializable' as any },
    );
  }

  private async removeRiderAccess(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Rider user not found');

    await tx.$executeRawUnsafe(
      `UPDATE "UserRoleMembership"
       SET "status" = 'REVOKED', "revokedAt" = CURRENT_TIMESTAMP
       WHERE "userId" = $1 AND "role" = 'RIDER' AND "status" = 'ACTIVE'`,
      userId,
    );

    if (user.role !== Role.RIDER) return;

    const alternatives = await tx.$queryRawUnsafe(
      `SELECT "role" FROM "UserRoleMembership"
       WHERE "userId" = $1 AND "status" = 'ACTIVE' AND "role" <> 'RIDER'
       ORDER BY "grantedAt" ASC LIMIT 1`,
      userId,
    );
    let fallbackRole = alternatives[0]?.role as Role | undefined;

    // Preserve legitimate legacy multi-role identities even if they predate the
    // membership table. A Store owner or Customer with order history must not
    // lose that account merely because Rider access is removed.
    if (!fallbackRole) {
      const ownedStore = await tx.store.findFirst({
        where: { ownerId: userId },
        select: { id: true },
      });
      if (ownedStore) fallbackRole = Role.STORE_OWNER;
    }
    if (!fallbackRole) {
      const customerOrder = await tx.order.findFirst({
        where: { customerId: userId },
        select: { id: true },
      });
      if (customerOrder) fallbackRole = Role.CUSTOMER;
    }

    if (fallbackRole) {
      await tx.user.update({
        where: { id: userId },
        data: {
          role: fallbackRole,
          isActive: true,
          deactivatedAt: null,
          deactivationReason: null,
        },
      });
      return;
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deactivatedAt: new Date(),
        deactivationReason: 'Rider access removed by administrator',
      },
    });
  }

  private async hasFreshAvailability(tx: DbClient, riderProfileId: string) {
    const configured = Number(process.env.AUTO_DISPATCH_LOCATION_MAX_AGE_SECONDS);
    const maxAgeSeconds = Number.isFinite(configured)
      ? Math.max(30, Math.min(86_400, Math.floor(configured)))
      : 180;
    const availability = await tx.riderAvailabilityLocation.findUnique({
      where: { riderProfileId },
      select: { capturedAt: true },
    });
    return Boolean(
      availability &&
        availability.capturedAt >=
          new Date(Date.now() - maxAgeSeconds * 1_000),
    );
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

  private lockStatus(tx: DbClient, riderUserId: string) {
    return tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${`rider-status:user:${riderUserId}`}))::text AS "lock"
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

  private scheduleDispatchWaitingJobs() {
    setImmediate(() => {
      void this.dispatchWaitingJobs();
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

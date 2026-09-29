/**
 * Shared rider-portal lookups, profile sanitisation and constants.
 *
 * Split out of the former rider-portal.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { prisma } from '@aagam/database';
import { RiderHistoryQueryDto } from './rider-portal.dto';

export const ACTIVE_STATUSES = [
  "RIDER_ASSIGNED",
  "RIDER_EN_ROUTE_TO_STORE",
  "RIDER_AT_STORE",
  "PICKUP_VERIFIED",
  "OUT_FOR_DELIVERY",
  "RIDER_AT_CUSTOMER",
  "DELIVERY_FAILED",
  "RETURNING_TO_STORE",
];
export const jobInclude = {
  order: {
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      },
      payment: {
        select: {
          method: true,
          status: true,
          amountPaise: true,
          currency: true,
        },
      },
      items: {
        include: { product: { select: { id: true, name: true, image: true } } },
      },
    },
  },
  events: { orderBy: { createdAt: "asc" as const } },
  assignments: { orderBy: { createdAt: "desc" as const }, take: 10 },
  pickupProof: true,
  deliveryProof: true,
  codLedger: {
    include: { entries: { orderBy: { createdAt: "asc" as const } } },
  },
  failureDecisions: { orderBy: { createdAt: "desc" as const }, take: 10 },
};

export class RiderPortalServiceBase {
  protected async rider(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatarUrl: true,
          },
        },
      },
    });
    if (!rider) throw new NotFoundException("Rider profile not found");
    return rider;
  }

  protected range(query: RiderHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to)
      throw new BadRequestException("from must be before to");
    return from || to
      ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) }
      : undefined;
  }

  protected activeJob(riderProfileId: string) {
    return prisma.deliveryJob.findFirst({
      where: {
        currentRiderId: riderProfileId,
        status: { in: ACTIVE_STATUSES as any },
        order: { status: { notIn: ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'] as any } },
      },
      include: jobInclude,
      orderBy: { updatedAt: "desc" },
    });
  }

  protected activeJobs(riderProfileId: string) {
    return prisma.deliveryJob.findMany({
      where: {
        currentRiderId: riderProfileId,
        status: { in: ACTIVE_STATUSES as any },
        order: { status: { notIn: ['CANCELLED', 'PAYMENT_FAILED', 'DELIVERED'] as any } },
      },
      include: jobInclude,
      orderBy: [{ order: { deliveryWindowEnd: "asc" } }, { createdAt: "asc" }],
    });
  }

  protected safeProfile(rider: any) {
    const {
      bankAccountCiphertext: _account,
      bankIfscCiphertext: _ifsc,
      ...safe
    } = rider;
    return {
      ...safe,
      bank: rider.bankAccountLast4
        ? {
            accountMasked: `••••${rider.bankAccountLast4}`,
            status: rider.bankStatus,
          }
        : null,
    };
  }

  protected encryptSensitive(value: string) {
    const secret = process.env.RIDER_BANK_ENCRYPTION_KEY;
    if (!secret || secret.length < 24)
      throw new ServiceUnavailableException(
        "Protected bank storage is not configured"
      );
    const key = createHash("sha256").update(secret).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return `${iv.toString("base64")}.${cipher
      .getAuthTag()
      .toString("base64")}.${ciphertext.toString("base64")}`;
  }
}

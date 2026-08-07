import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GeofenceDecision, GeofencePhase, Prisma, Role, SubscriptionDeliveryMethod, prisma } from '@aagam/database';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { UploadService } from '../upload/upload.service';
import { haversineKm } from './regional-routing.geometry';

type Actor = { id: string; role: Role };
type Tx = Prisma.TransactionClient;

type ParsedToken = {
  challengeId: string;
  subscriptionId: string;
  subscriptionDeliveryId: string | null;
  version: number;
  expiresAt: number;
  nonce: string;
};

@Injectable()
export class TrustedDropService {
  constructor(private readonly uploads: UploadService) {}

  private signingKey() {
    const value = process.env.TRUSTED_DROP_SIGNING_SECRET || process.env.JWT_SECRET;
    if (!value || value.length < 32) throw new Error('TRUSTED_DROP_SIGNING_SECRET or JWT_SECRET >= 32 characters is required');
    return value;
  }

  private hash(value: string | Buffer) {
    return createHash('sha256').update(value).digest('hex');
  }

  private sign(body: string) {
    return createHmac('sha256', this.signingKey()).update(body).digest('base64url');
  }

  private encode(payload: ParsedToken) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `aagam.td.v1.${body}.${this.sign(body)}`;
  }

  private decode(token: string): ParsedToken {
    const parts = token.trim().split('.');
    if (parts.length !== 5 || parts[0] !== 'aagam' || parts[1] !== 'td' || parts[2] !== 'v1') {
      throw new BadRequestException('Trusted Drop QR is invalid');
    }
    const [body, signature] = [parts[3], parts[4]];
    const expected = Buffer.from(this.sign(body));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new BadRequestException('Trusted Drop QR signature is invalid');
    }
    let parsed: ParsedToken;
    try { parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ParsedToken; }
    catch { throw new BadRequestException('Trusted Drop QR payload is invalid'); }
    if (!parsed.challengeId || !parsed.subscriptionId || !Number.isInteger(parsed.version) || !parsed.nonce) {
      throw new BadRequestException('Trusted Drop QR payload is incomplete');
    }
    if (Date.now() >= parsed.expiresAt) throw new BadRequestException('Trusted Drop QR has expired');
    return parsed;
  }

  private async ownedSubscription(customerId: string, subscriptionId: string) {
    const subscription = await prisma.customerSubscription.findFirst({
      where: { id: subscriptionId, customerId },
      include: { trustedDropCredential: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.deliveryMethod !== SubscriptionDeliveryMethod.TRUSTED_DROP) {
      throw new BadRequestException('Trusted Drop QR is available only for Trusted Drop subscriptions');
    }
    return subscription;
  }

  async issue(customerId: string, subscriptionId: string, subscriptionDeliveryId?: string) {
    const subscription = await this.ownedSubscription(customerId, subscriptionId);
    if (subscriptionDeliveryId) {
      const delivery = await prisma.subscriptionDelivery.findFirst({ where: { id: subscriptionDeliveryId, subscriptionId } });
      if (!delivery) throw new NotFoundException('Subscription delivery not found');
    }
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`trusted-drop:${subscriptionId}`}))`);
      const credential = await tx.trustedDropCredential.upsert({
        where: { subscriptionId },
        create: { subscriptionId, customerId },
        update: { status: 'ACTIVE', revokedAt: null },
      });
      const challengeId = `tdc_${randomBytes(16).toString('hex')}`;
      const nonce = randomBytes(32).toString('base64url'); // 256-bit CSPRNG secret, returned once only.
      const expiresAt = new Date(Date.now() + Math.max(5 * 60_000, Number(process.env.TRUSTED_DROP_QR_TTL_MS || 24 * 60 * 60_000)));
      const payload: ParsedToken = {
        challengeId,
        subscriptionId,
        subscriptionDeliveryId: subscriptionDeliveryId || null,
        version: credential.version,
        expiresAt: expiresAt.getTime(),
        nonce,
      };
      const token = this.encode(payload);
      await tx.trustedDropChallenge.create({
        data: {
          id: challengeId,
          credentialId: credential.id,
          subscriptionId,
          subscriptionDeliveryId: subscriptionDeliveryId || null,
          customerId,
          version: credential.version,
          tokenHash: this.hash(token),
          expiresAt,
        },
      });
      return { token, version: credential.version, expiresAt, subscriptionDeliveryId: subscriptionDeliveryId || null };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async rotate(customerId: string, subscriptionId: string) {
    await this.ownedSubscription(customerId, subscriptionId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`trusted-drop:${subscriptionId}`}))`);
      const credential = await tx.trustedDropCredential.upsert({
        where: { subscriptionId },
        create: { subscriptionId, customerId, version: 1 },
        update: { version: { increment: 1 }, status: 'ACTIVE', rotatedAt: new Date(), revokedAt: null },
      });
      await tx.trustedDropChallenge.updateMany({ where: { credentialId: credential.id, usedAt: null }, data: { revokedAt: new Date() } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return this.issue(customerId, subscriptionId);
  }

  async revoke(customerId: string, subscriptionId: string) {
    await this.ownedSubscription(customerId, subscriptionId);
    return prisma.$transaction(async (tx) => {
      const credential = await tx.trustedDropCredential.findUnique({ where: { subscriptionId } });
      if (!credential) return { revoked: true };
      await tx.trustedDropCredential.update({ where: { id: credential.id }, data: { status: 'REVOKED', revokedAt: new Date() } });
      await tx.trustedDropChallenge.updateMany({ where: { credentialId: credential.id, usedAt: null }, data: { revokedAt: new Date() } });
      return { revoked: true };
    });
  }

  async verifyForStop(tx: Tx, token: string, stop: { id: string; subscriptionDeliveryId: string; deliveryJobId: string }, riderId: string) {
    const parsed = this.decode(token);
    if (parsed.subscriptionDeliveryId && parsed.subscriptionDeliveryId !== stop.subscriptionDeliveryId) {
      throw new ForbiddenException('Trusted Drop QR is bound to a different delivery');
    }
    const delivery = await tx.subscriptionDelivery.findUnique({ where: { id: stop.subscriptionDeliveryId }, select: { subscriptionId: true } });
    if (!delivery || delivery.subscriptionId !== parsed.subscriptionId) throw new ForbiddenException('Trusted Drop QR belongs to another subscription');
    const challenge = await tx.trustedDropChallenge.findUnique({ where: { id: parsed.challengeId }, include: { credential: true } });
    if (!challenge || challenge.tokenHash !== this.hash(token)) throw new BadRequestException('Trusted Drop QR challenge is invalid');
    if (challenge.usedAt) throw new ConflictException('Trusted Drop QR has already been used');
    if (challenge.revokedAt || challenge.expiresAt <= new Date()) throw new BadRequestException('Trusted Drop QR is expired or revoked');
    if (challenge.credential.status !== 'ACTIVE' || challenge.version !== challenge.credential.version || challenge.version !== parsed.version) {
      throw new ConflictException('Trusted Drop QR version is no longer active');
    }
    return challenge;
  }

  async uploadEvidence(input: { file: Express.Multer.File; runId: string; stopId: string; token: string; capturedAt?: string }, actor: Actor) {
    if (actor.role !== Role.RIDER) throw new ForbiddenException('Rider role is required');
    if (!input.file || input.file.size < 1 || input.file.size > 6 * 1024 * 1024) throw new BadRequestException('Trusted Drop photo must be between 1 byte and 6 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(input.file.mimetype)) throw new BadRequestException('Trusted Drop evidence must be JPEG, PNG, or WebP');
    const rider = await prisma.riderProfile.findUnique({ where: { userId: actor.id } });
    if (!rider) throw new ForbiddenException('Rider profile not found');
    const stop = await prisma.deliveryRunStop.findFirst({
      where: { id: input.stopId, deliveryRunId: input.runId, deliveryRun: { riderId: rider.id } },
      include: { trustedDropEvidence: true },
    });
    if (!stop) throw new NotFoundException('Assigned run stop not found');
    if (stop.trustedDropEvidence) return stop.trustedDropEvidence;
    const challenge = await prisma.$transaction((tx) => this.verifyForStop(tx, input.token, stop, rider.id));
    const uploaded = await this.uploads.uploadEvidence(input.file, {
      scope: 'subscription-trusted-drop', ownerId: stop.subscriptionDeliveryId, documentType: `stop-${stop.id}`,
    });
    try {
      return await prisma.trustedDropEvidence.create({
        data: {
          deliveryRunStopId: stop.id,
          deliveryJobId: stop.deliveryJobId,
          subscriptionDeliveryId: stop.subscriptionDeliveryId,
          riderId: rider.id,
          challengeId: challenge.id,
          credentialVersion: challenge.version,
          storageKey: uploaded.storageKey,
          mimeType: input.file.mimetype,
          sizeBytes: input.file.size,
          sha256: this.hash(input.file.buffer),
          capturedAt: input.capturedAt ? new Date(input.capturedAt) : new Date(),
        },
      });
    } catch (error) {
      await this.uploads.deleteEvidence(uploaded.storageKey).catch(() => undefined);
      throw error;
    }
  }

  async recordGeofence(tx: Tx, input: {
    stopId: string; riderId: string; phase: GeofencePhase; latitude: number; longitude: number; accuracyMetres?: number;
  }) {
    const stop = await tx.deliveryRunStop.findUnique({ where: { id: input.stopId }, select: { deliveryLatitude: true, deliveryLongitude: true } });
    if (!stop || stop.deliveryLatitude == null || stop.deliveryLongitude == null) throw new BadRequestException('Authoritative stop coordinates are unavailable');
    const accuracy = Number(input.accuracyMetres ?? 9999);
    const distanceMetres = haversineKm(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: stop.deliveryLatitude, longitude: stop.deliveryLongitude },
    ) * 1000;
    const allowedRadiusMetres = Math.max(20, Number(process.env.TRUSTED_DROP_GEOFENCE_RADIUS_METRES || 120));
    const maxAccuracyMetres = Math.max(10, Number(process.env.TRUSTED_DROP_MAX_GPS_ACCURACY_METRES || 80));
    const decision: GeofenceDecision = accuracy > maxAccuracyMetres
      ? GeofenceDecision.FAIL_ACCURACY
      : distanceMetres > allowedRadiusMetres ? GeofenceDecision.FAIL_DISTANCE : GeofenceDecision.PASS;
    const proof = await tx.runStopGeofenceProof.create({
      data: {
        deliveryRunStopId: input.stopId,
        riderId: input.riderId,
        phase: input.phase,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyMetres: accuracy,
        distanceToStopMetres: distanceMetres,
        allowedRadiusMetres,
        decision,
        measuredAt: new Date(),
      },
    });
    return { proof, passed: decision === GeofenceDecision.PASS };
  }

  async consumeChallengeWithinTransaction(tx: Tx, challengeId: string, stopId: string, evidenceId: string) {
    const evidence = await tx.trustedDropEvidence.findFirst({ where: { id: evidenceId, deliveryRunStopId: stopId, challengeId } });
    if (!evidence) throw new BadRequestException('Trusted Drop evidence is not bound to this stop and QR challenge');
    const updated = await tx.trustedDropChallenge.updateMany({
      where: { id: challengeId, usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictException('Trusted Drop QR was already used, revoked, or expired');
  }
}

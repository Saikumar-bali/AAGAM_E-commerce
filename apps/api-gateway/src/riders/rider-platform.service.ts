import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, prisma, Role } from '@aagam/database';
import { UploadService } from '../upload/upload.service';
import { RiderContactDto, RiderHistoryQueryDto } from './rider-portal.dto';

const TERMINAL_STATUSES = ['DELIVERED', 'DELIVERY_FAILED', 'RETURNED_TO_STORE', 'CANCELLED'] as const;
const ACTIVE_CONTACT_STATUSES = [
  'RIDER_ASSIGNED', 'RIDER_EN_ROUTE_TO_STORE', 'RIDER_AT_STORE', 'PICKUP_VERIFIED',
  'OUT_FOR_DELIVERY', 'RIDER_AT_CUSTOMER', 'DELIVERY_FAILED', 'RETURNING_TO_STORE',
] as const;
const detailInclude = {
  order: {
    include: {
      customer: { select: { id: true, name: true } },
      store: { select: { id: true, name: true, address: true, latitude: true, longitude: true } },
      payment: { select: { method: true, status: true, amountPaise: true, currency: true } },
      items: { include: { product: { select: { id: true, name: true, image: true } } } },
    },
  },
  events: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, eventType: true, fromStatus: true, toStatus: true, actorRole: true, createdAt: true },
  },
  assignments: {
    orderBy: { createdAt: 'asc' as const },
    select: { id: true, status: true, offeredAt: true, respondedAt: true, expiresAt: true, rejectionReason: true, createdAt: true },
  },
  pickupProof: true,
  deliveryProof: true,
  codLedger: { include: { entries: { orderBy: { createdAt: 'asc' as const } } } },
  failureDecisions: { orderBy: { createdAt: 'asc' as const } },
} as const;
type OwnedJob = Prisma.DeliveryJobGetPayload<{ include: typeof detailInclude }>;

function pageNumber(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
function maskName(value?: string | null) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  return [parts[0], ...parts.slice(1).map((part) => `${part[0]}.`)].join(' ');
}
function maskedAddress(snapshot: unknown) {
  const value = (snapshot || {}) as Record<string, unknown>;
  return {
    city: typeof value.city === 'string' ? value.city : null,
    state: typeof value.state === 'string' ? value.state : null,
    pincode: typeof value.pincode === 'string' ? `•••${value.pincode.slice(-3)}` : null,
    landmark: typeof value.landmark === 'string' ? value.landmark : null,
  };
}
function evidenceKeys(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

@Injectable()
export class RiderPlatformService {
  constructor(private readonly uploads: UploadService) {}

  sanitizePortalPayload<T>(payload: T): T {
    const visit = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(visit);
      if (!value || typeof value !== 'object' || value instanceof Date) return value;
      const clean: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        if (['phone', 'phoneE164', 'alternatePhoneE164', 'email', 'customerSnapshot'].includes(key)) continue;
        clean[key] = visit(entry);
      }
      return clean;
    };
    return visit(payload) as T;
  }

  private async rider(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, avatarUrl: true, createdAt: true } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!rider) throw new NotFoundException('Rider profile not found');
    return rider;
  }

  private range(query: RiderHistoryQueryDto) {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && Number.isNaN(from.getTime())) throw new BadRequestException('Invalid history start date');
    if (to && Number.isNaN(to.getTime())) throw new BadRequestException('Invalid history end date');
    if (from && to && from > to) throw new BadRequestException('from must be before to');
    return from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
  }

  async eligibility(userId: string) {
    const rider = await this.rider(userId);
    const now = new Date();
    const expired = rider.documents.filter((document) => document.expiresAt && document.expiresAt <= now);
    const rejected = rider.documents.filter((document) => document.status === 'REJECTED');
    const reasons: Array<{ code: string; message: string; route: string }> = [];
    if (rider.approvalStatus !== 'APPROVED') {
      reasons.push({
        code: `PROFILE_${rider.approvalStatus}`,
        message: rider.approvalStatus === 'REJECTED'
          ? 'Your Rider profile needs changes before you can work.'
          : rider.approvalStatus === 'EXPIRED'
            ? 'Your Rider approval has expired and must be renewed.'
            : 'Your Rider profile is still under review.',
        route: 'AccountDocuments',
      });
    }
    if (expired.length) reasons.push({ code: 'DOCUMENT_EXPIRED', message: `${expired.length} compliance document${expired.length === 1 ? '' : 's'} expired.`, route: 'AccountDocuments' });
    if (rejected.length) reasons.push({ code: 'DOCUMENT_REJECTED', message: `${rejected.length} document${rejected.length === 1 ? '' : 's'} require replacement.`, route: 'AccountDocuments' });
    return {
      approvalStatus: rider.approvalStatus,
      bankStatus: rider.bankStatus,
      documentStatus: expired.length ? 'EXPIRED' : rejected.length ? 'ACTION_REQUIRED' : rider.documents.some((document) => document.status === 'PENDING') ? 'UNDER_REVIEW' : 'COMPLIANT',
      canGoOnline: reasons.length === 0,
      canAcceptOffers: reasons.length === 0,
      canReceivePayout: rider.bankStatus === 'APPROVED',
      reasons,
      verificationHistory: { submittedAt: rider.user.createdAt, profileReviewedAt: rider.approvalReviewedAt, bankReviewedAt: rider.bankReviewedAt },
    };
  }

  validateSchedule(entries: Array<{ dayOfWeek: number; startMinute: number; endMinute: number; isAvailable: boolean }>) {
    const byDay = new Map<number, Array<{ startMinute: number; endMinute: number }>>();
    for (const entry of entries) {
      if (entry.startMinute >= entry.endMinute) throw new BadRequestException('Availability start time must be before end time');
      const duration = entry.endMinute - entry.startMinute;
      if (duration < 30 || duration > 16 * 60) throw new BadRequestException('Availability windows must be between 30 minutes and 16 hours');
      if (!entry.isAvailable) continue;
      byDay.set(entry.dayOfWeek, [...(byDay.get(entry.dayOfWeek) || []), { startMinute: entry.startMinute, endMinute: entry.endMinute }]);
    }
    for (const rows of byDay.values()) {
      rows.sort((left, right) => left.startMinute - right.startMinute);
      for (let index = 1; index < rows.length; index += 1) {
        if (rows[index].startMinute < rows[index - 1].endMinute) throw new BadRequestException('Availability windows cannot overlap');
      }
    }
    return true;
  }

  async reportPickupProblem(userId: string, deliveryJobId: string, input: { problemType: string; note: string; evidenceKeys?: string[] }) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({ where: { id: deliveryJobId, currentRiderId: rider.id, status: 'RIDER_AT_STORE' }, select: { id: true } });
    if (!job) throw new NotFoundException('Assigned pickup job not found');
    const keys = input.evidenceKeys || [];
    if (keys.some((key) => !key.startsWith(`evidence/${userId}/`))) throw new BadRequestException('Pickup evidence does not belong to this Rider');
    return prisma.$transaction(async (tx) => {
      const task = await tx.riderPickupTask.upsert({
        where: { deliveryJobId },
        create: { riderProfileId: rider.id, deliveryJobId, checklist: [], status: 'PROBLEM_REPORTED', problemType: input.problemType, problemNote: input.note.trim() },
        update: { status: 'PROBLEM_REPORTED', problemType: input.problemType, problemNote: input.note.trim() },
      });
      if (keys.length) {
        await tx.riderSupportTicket.create({
          data: {
            riderProfileId: rider.id,
            deliveryJobId,
            category: 'PICKUP',
            subject: `Pickup evidence: ${input.problemType}`,
            description: input.note.trim(),
            evidenceKeys: keys,
            messages: { create: { senderUserId: userId, senderRole: Role.RIDER, body: input.note.trim(), evidenceKeys: keys } },
          },
        });
      }
      return task;
    });
  }

  async profile(userId: string) {
    const rider = await this.rider(userId);
    const eligibility = await this.eligibility(userId);
    const { bankAccountCiphertext: _account, bankIfscCiphertext: _ifsc, ...safe } = rider;
    return { ...safe, bank: rider.bankAccountLast4 ? { accountMasked: `••••${rider.bankAccountLast4}`, status: rider.bankStatus } : null, eligibility };
  }

  private async ownedJob(userId: string, deliveryJobId: string): Promise<OwnedJob> {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({ where: { id: deliveryJobId, currentRiderId: rider.id }, include: detailInclude });
    if (!job) throw new NotFoundException('Delivery job not found for this Rider');
    return job;
  }
  private outcomeAt(job: OwnedJob) {
    if (job.status === 'DELIVERED') return job.deliveryProof?.verifiedAt || job.order.deliveredAt || job.updatedAt;
    if (job.status === 'CANCELLED') return job.order.cancelledAt || job.updatedAt;
    const decision = job.failureDecisions[job.failureDecisions.length - 1];
    return decision?.appliedAt || decision?.updatedAt || job.updatedAt;
  }
  private listItem(job: OwnedJob) {
    return {
      id: job.id,
      orderId: job.orderId,
      status: job.status,
      outcomeAt: this.outcomeAt(job),
      store: { id: job.order.store.id, name: job.order.store.name, address: job.order.store.address },
      customer: { name: maskName(job.order.customer?.name), destination: maskedAddress(job.order.addressSnapshot) },
      itemCount: job.order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      parcelCount: job.pickupProof?.parcelCount || null,
      payment: job.order.payment,
      codStatus: job.codLedger?.status || null,
      hasReceipt: TERMINAL_STATUSES.includes(job.status as any),
    };
  }

  async history(userId: string, query: RiderHistoryQueryDto) {
    const rider = await this.rider(userId);
    const page = pageNumber(query.page, 1, 100000);
    const pageSize = pageNumber(query.pageSize, 20, 50);
    const updatedAt = this.range(query);
    const statuses = query.status && query.status !== 'ALL' ? [query.status] : [...TERMINAL_STATUSES];
    const where: Prisma.DeliveryJobWhereInput = { currentRiderId: rider.id, status: { in: statuses as any }, ...(updatedAt ? { updatedAt } : {}) };
    const [jobs, total] = await prisma.$transaction([
      prisma.deliveryJob.findMany({ where, include: detailInclude, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.deliveryJob.count({ where }),
    ]);
    return { items: jobs.map((job) => this.listItem(job)), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), serverTime: new Date() };
  }

  async jobDetail(userId: string, deliveryJobId: string) {
    const job = await this.ownedJob(userId, deliveryJobId);
    const [operations, earnings, pickupTask, pickupEvidenceTickets] = await Promise.all([
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT "id", "type"::text, "status"::text, "actorRole"::text,
               "details" - 'nonce' - 'salt' - 'codeHash' - 'otpCode' AS "details",
               "createdAt", "updatedAt"
        FROM "DeliveryOperation"
        WHERE "deliveryJobId" = ${job.id}
        ORDER BY "createdAt" ASC
      `),
      prisma.riderEarning.findMany({ where: { deliveryJobId: job.id, riderProfileId: job.currentRiderId! }, orderBy: { earnedAt: 'asc' } }),
      prisma.riderPickupTask.findUnique({ where: { deliveryJobId: job.id } }),
      prisma.riderSupportTicket.findMany({ where: { deliveryJobId: job.id, riderProfileId: job.currentRiderId!, category: 'PICKUP' }, select: { evidenceKeys: true, messages: { select: { evidenceKeys: true } } } }),
    ]);
    return {
      ...this.listItem(job),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      items: job.order.items.map((item) => ({ id: item.id, name: item.product.name, image: item.product.image, quantity: item.quantity })),
      pickup: job.pickupProof ? {
        verificationMethod: job.pickupProof.verificationMethod,
        verifiedAt: job.pickupProof.verifiedAt,
        parcelCount: job.pickupProof.parcelCount,
        coordinates: job.pickupProof.latitude == null ? null : { latitude: job.pickupProof.latitude, longitude: job.pickupProof.longitude, accuracyMetres: job.pickupProof.accuracyMetres },
      } : null,
      pickupTask: pickupTask ? {
        status: pickupTask.status,
        checklist: pickupTask.checklist,
        problemType: pickupTask.problemType,
        problemNote: pickupTask.problemNote,
        problemEvidenceKeys: pickupEvidenceTickets.flatMap((ticket) => [...evidenceKeys(ticket.evidenceKeys), ...ticket.messages.flatMap((message) => evidenceKeys(message.evidenceKeys))]),
        verifiedAt: pickupTask.verifiedAt,
      } : null,
      delivery: job.deliveryProof ? {
        verificationMethod: job.deliveryProof.verificationMethod,
        otpVerified: Boolean(job.deliveryProof.otpOperationId),
        riderConfirmedAt: job.deliveryProof.riderConfirmedAt,
        verifiedAt: job.deliveryProof.verifiedAt,
        note: job.deliveryProof.note,
        coordinates: job.deliveryProof.latitude == null ? null : { latitude: job.deliveryProof.latitude, longitude: job.deliveryProof.longitude, accuracyMetres: job.deliveryProof.accuracyMetres },
      } : null,
      cod: job.codLedger ? {
        expectedAmountPaise: job.codLedger.expectedAmountPaise,
        collectedAmountPaise: job.codLedger.collectedAmountPaise,
        heldAmountPaise: job.codLedger.riderHoldingBalancePaise,
        depositedAmountPaise: job.codLedger.depositedAmountPaise,
        variancePaise: job.codLedger.variancePaise,
        status: job.codLedger.status,
        settlementReference: job.codLedger.settlementReference,
        collectionTimestamp: job.codLedger.collectionTimestamp,
        entries: job.codLedger.entries,
      } : null,
      earnings: earnings.map((entry) => ({ ...entry, signedAmountPaise: entry.type === 'PENALTY' ? -Math.abs(entry.amountPaise) : entry.amountPaise })),
      failure: job.failureDecisions,
      timeline: [
        ...job.events.map((event) => ({ id: event.id, source: 'DELIVERY_EVENT', type: event.eventType, fromStatus: event.fromStatus, toStatus: event.toStatus, actorRole: event.actorRole, createdAt: event.createdAt })),
        ...operations.map((operation) => ({ id: operation.id, source: 'DELIVERY_OPERATION', type: operation.type, status: operation.status, actorRole: operation.actorRole, details: operation.details, createdAt: operation.createdAt })),
      ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    };
  }

  async receipt(userId: string, deliveryJobId: string) {
    const detail = await this.jobDetail(userId, deliveryJobId);
    if (!TERMINAL_STATUSES.includes(detail.status as any)) throw new BadRequestException('A receipt is available only for a terminal delivery');
    return {
      receiptVersion: 1,
      deliveryJobId: detail.id,
      orderId: detail.orderId,
      status: detail.status,
      outcomeAt: detail.outcomeAt,
      store: detail.store,
      customer: detail.customer,
      itemCount: detail.itemCount,
      parcelCount: detail.parcelCount,
      payment: detail.payment,
      pickup: detail.pickup,
      delivery: detail.delivery,
      cod: detail.cod,
      earnings: detail.earnings,
      failure: detail.failure,
      timeline: detail.timeline,
      privacy: { customerPhoneIncluded: false, fullAddressIncluded: false, otpIncluded: false, signedEvidenceIncluded: false },
    };
  }

  async earnings(userId: string, query: RiderHistoryQueryDto) {
    const rider = await this.rider(userId);
    const page = pageNumber(query.page, 1, 100000);
    const pageSize = pageNumber(query.pageSize, 30, 100);
    const earnedAt = this.range(query);
    const where: Prisma.RiderEarningWhereInput = { riderProfileId: rider.id, ...(earnedAt ? { earnedAt } : {}) };
    const [records, all, total] = await prisma.$transaction([
      prisma.riderEarning.findMany({ where, orderBy: [{ earnedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.riderEarning.findMany({ where }),
      prisma.riderEarning.count({ where }),
    ]);
    const signed = (row: { type: string; amountPaise: number }) => row.type === 'PENALTY' ? -Math.abs(row.amountPaise) : row.amountPaise;
    const now = new Date();
    const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart); weekStart.setDate(dayStart.getDate() - ((dayStart.getDay() + 6) % 7));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sum = (rows: typeof all) => rows.reduce((value, row) => value + signed(row), 0);
    const byType = Object.fromEntries(['BASE_DELIVERY_FEE', 'DISTANCE_INCENTIVE', 'BONUS', 'PENALTY'].map((type) => [type, sum(all.filter((row) => row.type === type))]));
    return {
      records: records.map((row) => ({ ...row, signedAmountPaise: signed(row) })),
      summary: {
        dailyPaise: sum(all.filter((row) => row.earnedAt >= dayStart)),
        weeklyPaise: sum(all.filter((row) => row.earnedAt >= weekStart)),
        monthlyPaise: sum(all.filter((row) => row.earnedAt >= monthStart)),
        pendingPaise: sum(all.filter((row) => row.status === 'PENDING')),
        paidPaise: sum(all.filter((row) => row.status === 'PAID')),
        byType,
      },
      page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async cod(userId: string) {
    const rider = await this.rider(userId);
    const ledgers = await prisma.codLedger.findMany({
      where: { riderId: rider.id },
      include: { entries: { orderBy: { createdAt: 'asc' } }, order: { select: { id: true, deliveredAt: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return {
      cashHeldPaise: ledgers.reduce((sum, row) => sum + row.riderHoldingBalancePaise, 0),
      collectedPaise: ledgers.reduce((sum, row) => sum + row.collectedAmountPaise, 0),
      depositedPaise: ledgers.reduce((sum, row) => sum + row.depositedAmountPaise, 0),
      variancePaise: ledgers.reduce((sum, row) => sum + row.variancePaise, 0),
      pendingHandovers: ledgers.filter((row) => row.riderHoldingBalancePaise > 0 || row.status === 'VARIANCE_REVIEW').map((row) => ({ deliveryJobId: row.deliveryJobId, orderId: row.orderId, amountPaise: row.riderHoldingBalancePaise, collectedAt: row.collectionTimestamp, status: row.status })),
      settledHistory: ledgers.filter((row) => row.status === 'SETTLED' || row.depositedAmountPaise > 0).map((row) => ({ deliveryJobId: row.deliveryJobId, orderId: row.orderId, depositedAmountPaise: row.depositedAmountPaise, variancePaise: row.variancePaise, settlementReference: row.settlementReference, status: row.status, receiptEntries: row.entries.filter((entry) => entry.type === 'DEPOSITED') })),
      ledgers,
      policy: { riderCanSettle: false, confirmationRoles: [Role.STORE_OWNER, Role.ADMIN], partialDepositsSupported: true, immutableLedger: true },
    };
  }

  async offerDetail(userId: string, assignmentId: string) {
    const rider = await this.rider(userId);
    const eligibility = await this.eligibility(userId);
    const assignment = await prisma.dispatchAssignment.findFirst({ where: { id: assignmentId, riderProfileId: rider.id }, include: { deliveryJob: { include: detailInclude } } });
    if (!assignment) throw new NotFoundException('Rider offer not found');
    const job = assignment.deliveryJob;
    const payment = job.order.payment;
    const expectedCodPaise = payment?.method === 'COD' ? Number(payment.amountPaise || job.order.grandTotalPaise || 0) : 0;
    return {
      id: assignment.id,
      status: assignment.status,
      serverTime: new Date(),
      offeredAt: assignment.offeredAt,
      expiresAt: assignment.expiresAt,
      deliveryJobId: job.id,
      store: { id: job.order.store.id, name: job.order.store.name, address: job.order.store.address },
      customer: { name: maskName(job.order.customer?.name), destination: maskedAddress(job.order.addressSnapshot) },
      itemCount: job.order.items.reduce((sum, item) => sum + item.quantity, 0),
      parcelCount: job.pickupProof?.parcelCount || 1,
      paymentMethod: payment?.method || null,
      codResponsibility: expectedCodPaise > 0 ? { required: true, amountPaise: expectedCodPaise } : { required: false, amountPaise: 0 },
      payout: { source: 'RIDER_EARNING_LEDGER', estimatePaise: null, finalizationNote: 'Final earnings are posted to your Rider ledger after the delivery outcome.' },
      availabilityWarning: eligibility.canAcceptOffers ? null : eligibility.reasons[0],
      rejectionReasons: ['DISTANCE_TOO_FAR', 'SHIFT_ENDING', 'VEHICLE_ISSUE', 'SAFETY_CONCERN', 'LOCATION_UNAVAILABLE', 'ALREADY_COMMITTED', 'OTHER'],
    };
  }

  async previewDocument(userId: string, documentId: string) {
    const rider = await this.rider(userId);
    const document = rider.documents.find((entry) => entry.id === documentId);
    if (!document) throw new NotFoundException('Rider document not found');
    const signed = await this.uploads.signedEvidenceUrl(document.storageKey, { disposition: 'inline', filename: `${document.type.toLowerCase()}.${document.storageKey.split('.').pop() || 'bin'}` });
    return { documentId: document.id, type: document.type, status: document.status, expiresAt: document.expiresAt, ...signed };
  }

  async previewPickupEvidence(userId: string, deliveryJobId: string, storageKey: string) {
    const rider = await this.rider(userId);
    const tickets = await prisma.riderSupportTicket.findMany({ where: { deliveryJobId, riderProfileId: rider.id, category: 'PICKUP' }, select: { evidenceKeys: true, messages: { select: { evidenceKeys: true } } } });
    const authorized = tickets.some((ticket) => [...evidenceKeys(ticket.evidenceKeys), ...ticket.messages.flatMap((message) => evidenceKeys(message.evidenceKeys))].includes(storageKey));
    if (!authorized) throw new ForbiddenException('Pickup evidence does not belong to this Rider');
    return this.uploads.signedEvidenceUrl(storageKey, { disposition: 'inline' });
  }

  async contact(userId: string, deliveryJobId: string, input: RiderContactDto) {
    const rider = await this.rider(userId);
    const job = await prisma.deliveryJob.findFirst({
      where: { id: deliveryJobId, currentRiderId: rider.id, status: { in: [...ACTIVE_CONTACT_STATUSES] as any } },
      include: { order: { include: { customer: { select: { phone: true } }, store: { include: { owner: { select: { phone: true } } } } } } },
    });
    if (!job) throw new ForbiddenException('Contact is available only for your active assigned delivery');
    const targetPhone = input.targetRole === 'CUSTOMER' ? job.order.customer?.phone : job.order.store.owner?.phone;
    if (!targetPhone) throw new NotFoundException('Contact is unavailable');
    const relayTemplate = process.env.RIDER_CONTACT_RELAY_URI_TEMPLATE;
    const directFallbackEnabled = process.env.RIDER_CONTACT_DIRECT_FALLBACK_ENABLED === 'true';
    const mode = relayTemplate ? 'RELAY' : directFallbackEnabled ? 'DIRECT_APPROVED_FALLBACK' : 'IN_APP_ONLY';
    await prisma.deliveryEvent.create({ data: { deliveryJobId: job.id, eventType: 'LEGACY_ADAPTER_USED', actorUserId: userId, actorRole: Role.RIDER, metadata: { action: 'RIDER_CONTACT', targetRole: input.targetRole, channel: input.channel, mode } } });
    if (relayTemplate) return { mode, uri: relayTemplate.replace('{jobId}', encodeURIComponent(job.id)).replace('{targetRole}', encodeURIComponent(input.targetRole)), expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    if (directFallbackEnabled && input.channel === 'CALL') return { mode, uri: `tel:${targetPhone}`, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
    return {
      mode,
      uri: null,
      cannedMessages: ['I have arrived at the location.', 'Please keep the pickup or delivery ready.', 'I cannot locate the address. Please contact AAGAM support.'],
      supportRoute: `/riders/portal/support?deliveryJobId=${encodeURIComponent(job.id)}`,
    };
  }
}

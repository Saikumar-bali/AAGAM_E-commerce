import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import {
  ContactOtpService,
  resolveContactIdentifier,
} from '../contact-verification/contact-otp.service';
import { PartnerOnboardingRepository } from './partner-onboarding.repository';
import { PartnerOnboardingSecurity } from './partner-onboarding.security';

@Injectable()
export class PartnerApplicationRecoveryService {
  constructor(
    private readonly otp: ContactOtpService,
    private readonly repository: PartnerOnboardingRepository,
    private readonly security: PartnerOnboardingSecurity,
  ) {}

  private async findByIdentifier(identifier: string) {
    const contact = resolveContactIdentifier(identifier);
    const rows = await prisma.$queryRawUnsafe(
      contact.channel === 'PHONE'
        ? `SELECT * FROM "PartnerApplication"
           WHERE "phoneE164" = $1 AND "deletedAt" IS NULL
           ORDER BY "updatedAt" DESC LIMIT 1`
        : `SELECT * FROM "PartnerApplication"
           WHERE LOWER("email") = $1 AND "deletedAt" IS NULL
           ORDER BY "updatedAt" DESC LIMIT 1`,
      contact.destination,
    );
    if (!rows[0]) throw new NotFoundException('No Partner application uses this contact');
    return { contact, application: rows[0] };
  }

  async request(identifier: string) {
    const { contact, application } = await this.findByIdentifier(identifier);
    const challenge = await this.otp.request({
      purpose: 'PARTNER_RESUME',
      channel: contact.channel,
      destination: contact.destination,
      masked: contact.masked,
      targetId: application.id,
      reference: application.applicationNumber,
      metadata: {
        applicationNumber: application.applicationNumber,
        applicationType: application.type,
      },
    });
    return {
      ...challenge,
      message: `A verification code was sent to ${contact.masked}`,
    };
  }

  async verify(identifier: string, code: string) {
    const contact = resolveContactIdentifier(identifier);
    const challenge = await this.otp.verify({
      purpose: 'PARTNER_RESUME',
      channel: contact.channel,
      destination: contact.destination,
      code,
    });
    if (!challenge.targetId) throw new NotFoundException('Partner application not found');
    const application = await this.repository.findApplication(challenge.targetId);
    if (!application || application.deletedAt) {
      throw new NotFoundException('Partner application not found');
    }

    const accessToken = this.security.issueAccessToken();
    const verifiedColumn = contact.channel === 'PHONE' ? '"phoneVerifiedAt"' : '"emailVerifiedAt"';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `UPDATE "PartnerApplication" SET "accessSecretHash" = $2,
          ${verifiedColumn} = COALESCE(${verifiedColumn}, CURRENT_TIMESTAMP),
          "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`,
        application.id,
        this.security.hash(accessToken),
      );
      await this.repository.writeEvent(
        tx,
        application.id,
        'APPLICATION_ACCESS_RECOVERED',
        'APPLICANT',
        {
          message: `Application access recovered using verified ${contact.channel.toLowerCase()}.`,
          metadata: { channel: contact.channel },
        },
      );
    });

    const refreshed = await this.repository.findApplication(application.id);
    const response = await this.repository.response(refreshed!);
    return {
      applicationId: application.id,
      accessToken,
      ...response,
      loginReady: Boolean(
        refreshed?.status === 'APPROVED' && refreshed?.provisionedUserId,
      ),
    };
  }
}

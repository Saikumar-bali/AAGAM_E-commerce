import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { assertRiderEligibleForOperations } from './rider-operations-eligibility';
import { RiderPortalService } from './rider-portal.service';

@Injectable()
export class EligibleRiderPortalService extends RiderPortalService {
  private async assertUserEligible(userId: string) {
    const rider = await prisma.riderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!rider) throw new NotFoundException('Rider profile not found');
    await assertRiderEligibleForOperations(prisma, rider.id);
  }

  override async setStatus(
    userId: string,
    status: 'ONLINE' | 'OFFLINE',
  ) {
    if (status === 'ONLINE') await this.assertUserEligible(userId);
    return super.setStatus(userId, status);
  }

  override async endBreak(userId: string) {
    await this.assertUserEligible(userId);
    return super.endBreak(userId);
  }
}

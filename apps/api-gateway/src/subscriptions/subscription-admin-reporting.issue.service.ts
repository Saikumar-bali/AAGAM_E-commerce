/**
 * Subscription issue resolution.
 *
 * Split out of the former subscription-admin-reporting.service.ts god-service.
 * Behaviour is unchanged; this file only relocates cohesive members.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionIssueStatus, prisma } from '@aagam/database';
import { ResolveSubscriptionIssueDto } from './subscriptions.dto';
import { isOneOf } from '../common/enum-membership';

@Injectable()
export class SubscriptionAdminReportingIssueService {
  async resolveIssue(issueId: string, dto: ResolveSubscriptionIssueDto, actorId: string) {
    const issue = await prisma.subscriptionIssueReport.findUnique({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Subscription issue not found');
    if (issue.status === SubscriptionIssueStatus.RESOLVED && issue.resolution === dto.resolution.trim()) {
      return issue;
    }
    if (isOneOf(issue.status, [SubscriptionIssueStatus.RESOLVED, SubscriptionIssueStatus.REJECTED])) {
      throw new ConflictException('Subscription issue is already closed');
    }
    return prisma.subscriptionIssueReport.update({
      where: { id: issueId },
      data: {
        status: SubscriptionIssueStatus.RESOLVED,
        resolution: dto.resolution.trim(),
        resolvedById: actorId,
        resolvedAt: new Date(),
      },
    });
  }
}

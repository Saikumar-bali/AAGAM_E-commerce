import { Injectable } from '@nestjs/common';
import { Role } from '@aagam/database';
import { NotificationRoutingService } from './notification-routing.service';

@Injectable()
export class OperationalNotificationRoutingService extends NotificationRoutingService {
  async route(outboxEvent: any) {
    const routed = await super.route(outboxEvent);
    const payload = (outboxEvent?.payload || {}) as Record<string, any>;
    const title = typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : routed.title;
    const body = typeof payload.body === 'string' && payload.body.trim()
      ? payload.body.trim()
      : routed.body;
    const metadata = payload.metadata && typeof payload.metadata === 'object'
      ? payload.metadata
      : {};

    const deliveryJobId = payload.deliveryJobId || routed.deliveryJobId;
    const otpDeepLink = metadata.operationType === 'OTP_ISSUED' && deliveryJobId
      ? `/shop/delivery-code/${encodeURIComponent(String(deliveryJobId))}`
      : null;
    const recipients = otpDeepLink
      ? routed.recipients.map((recipient) => (
          recipient.role === Role.CUSTOMER
            ? { ...recipient, deepLink: otpDeepLink }
            : recipient
        ))
      : routed.recipients;

    return {
      ...routed,
      title,
      body,
      recipients,
      data: {
        ...((routed.data || {}) as Record<string, unknown>),
        ...metadata,
        ...(otpDeepLink ? { deepLink: otpDeepLink } : {}),
      },
    };
  }
}

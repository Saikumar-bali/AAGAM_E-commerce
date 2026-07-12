import { Injectable } from '@nestjs/common';
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

    return {
      ...routed,
      title,
      body,
      data: {
        ...((routed.data || {}) as Record<string, unknown>),
        ...metadata,
      },
    };
  }
}

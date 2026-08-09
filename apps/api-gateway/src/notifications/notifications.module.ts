import { Global, Module } from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRoutingService } from './notification-routing.service';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { NotificationsController } from './notifications.controller';
import { OutboxService } from './outbox.service';
import { PartnerNotificationInboxService } from './partner-notification-inbox.service';
import { PushSubscriptionService } from './push-subscription.service';
import { WebPushService } from './web-push.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    WebPushService,
    PushSubscriptionService,
    OutboxService,
    NotificationRoutingService,
    NotificationDeliveryService,
    NotificationService,
    PartnerNotificationInboxService,
    NotificationWorkerService,
  ],
  exports: [
    WebPushService,
    PushSubscriptionService,
    OutboxService,
    NotificationService,
    PartnerNotificationInboxService,
    NotificationWorkerService,
  ],
})
export class NotificationsModule {}

import { Global, Module } from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationRoutingService } from './notification-routing.service';
import { OperationalNotificationRoutingService } from './operational-notification-routing.service';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { NotificationsController } from './notifications.controller';
import { OutboxService } from './outbox.service';
import { PushSubscriptionService } from './push-subscription.service';
import { WebPushService } from './web-push.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    WebPushService,
    PushSubscriptionService,
    OutboxService,
    OperationalNotificationRoutingService,
    { provide: NotificationRoutingService, useExisting: OperationalNotificationRoutingService },
    NotificationDeliveryService,
    NotificationService,
    NotificationWorkerService,
  ],
  exports: [
    WebPushService,
    PushSubscriptionService,
    OutboxService,
    NotificationService,
    NotificationWorkerService,
  ],
})
export class NotificationsModule {}

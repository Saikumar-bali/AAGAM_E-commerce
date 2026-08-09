import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@aagam/database';
import {
  AdminBroadcastSchema,
  RegisterPushSubscriptionDto,
  RegisterPushSubscriptionSchema,
  UpdateNotificationPreferenceDto,
  UpdateNotificationPreferenceSchema,
} from '@aagam/types';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { NotificationService } from './notification.service';
import { NotificationWorkerService } from './notification-worker.service';
import { OutboxService } from './outbox.service';
import { PushSubscriptionService } from './push-subscription.service';

export function getFirebaseWebPushConfig() {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || '',
    authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_WEB_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_WEB_APP_ID || '',
  };
  // Firebase expects an unpadded URL-safe Base64 VAPID key. Environment values
  // are frequently copied with visual wrapping/whitespace, which breaks the
  // padding calculation inside Firebase Messaging before it calls window.atob().
  const vapidKey = (process.env.FIREBASE_WEB_VAPID_KEY || '').replace(/\s+/g, '');
  const blank = (value: string) => value.trim().length === 0;
  const enabled = [
    firebaseConfig.apiKey,
    firebaseConfig.projectId,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId,
    vapidKey,
  ].every((value) => !blank(value));

  return {
    enabled,
    vapidKey: enabled ? vapidKey : null,
    firebaseConfig: enabled ? firebaseConfig : null,
    missing: enabled
      ? []
      : [
          blank(firebaseConfig.apiKey) && 'FIREBASE_WEB_API_KEY',
          blank(firebaseConfig.projectId) && 'FIREBASE_WEB_PROJECT_ID',
          blank(firebaseConfig.messagingSenderId) && 'FIREBASE_WEB_MESSAGING_SENDER_ID',
          blank(firebaseConfig.appId) && 'FIREBASE_WEB_APP_ID',
          blank(vapidKey) && 'FIREBASE_WEB_VAPID_KEY',
        ].filter(Boolean),
  };
}

export function scopePartnerInbox(role: Role, inbox: any) {
  if (role !== Role.RIDER && role !== Role.STORE_OWNER) return inbox;

  const items = (Array.isArray(inbox?.items) ? inbox.items : []).filter((item: any) => {
    const metadata = item?.metadata || {};
    const isCanonicalRecipient = Boolean(item?.recipientId) && metadata.migratedFromOrderHistory !== true;
    if (isCanonicalRecipient) return true;

    // Support/rating rows predate the outbox and are still useful to the owning
    // Store. They are never Rider notifications. All order/delivery lifecycle
    // rows must come from NotificationRecipient so the documented role matrix is
    // enforced and legacy OrderStatusHistory cannot leak unrelated events.
    if (role === Role.STORE_OWNER) {
      return item?.type === 'CUSTOMER_SUPPORT_TICKET_OPENED'
        || item?.type === 'CUSTOMER_RATING_SUBMITTED';
    }
    return false;
  });

  return {
    ...inbox,
    items,
    unreadCount: items.filter((item: any) => !item?.readAt).length,
    source: 'PARTNER_SCOPED',
  };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly subscriptions: PushSubscriptionService,
    private readonly worker: NotificationWorkerService,
    private readonly outbox: OutboxService,
  ) {}

  private parse<T>(schema: { safeParse(value: unknown): any }, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid notification request',
        errors: parsed.error.issues,
      });
    }
    return parsed.data as T;
  }

  @Get('inbox')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  async inbox(@Req() req: any, @Query('limit') limit?: string) {
    const inbox = await this.notifications.listInbox(req.user, limit);
    return scopePartnerInbox(req.user.role, inbox);
  }

  @Patch(':notificationId/read')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  markRead(@Param('notificationId') notificationId: string, @Req() req: any) {
    return this.notifications.markRead(req.user, notificationId);
  }

  @Patch(':recipientId/opened')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  markOpened(@Param('recipientId') recipientId: string, @Req() req: any) {
    return this.notifications.markOpened(req.user, recipientId);
  }

  @Post('push/subscriptions')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  registerSubscription(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse<RegisterPushSubscriptionDto>(RegisterPushSubscriptionSchema, body);
    return this.subscriptions.register(req.user.id, dto);
  }

  @Get('push/subscriptions')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  listSubscriptions(@Req() req: any) {
    return this.subscriptions.list(req.user.id);
  }

  @Delete('push/subscriptions/:subscriptionId')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  disableSubscription(@Req() req: any, @Param('subscriptionId') subscriptionId: string) {
    return this.subscriptions.disable(req.user.id, subscriptionId);
  }

  @Get('push/config')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  pushConfig() {
    return getFirebaseWebPushConfig();
  }

  @Get('preferences')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  preferences(@Req() req: any) {
    return this.notifications.getPreferences(req.user.id);
  }

  @Patch('preferences')
  @Roles(Role.CUSTOMER, Role.STORE_OWNER, Role.RIDER, Role.ADMIN)
  updatePreference(@Req() req: any, @Body() body: unknown) {
    const dto = this.parse<UpdateNotificationPreferenceDto>(UpdateNotificationPreferenceSchema, body);
    return this.notifications.updatePreference(req.user.id, dto);
  }

  @Post('admin/broadcast')
  @Roles(Role.ADMIN)
  broadcast(
    @Req() req: any,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const dto = this.parse<any>(AdminBroadcastSchema, body);
    return this.notifications.createBroadcast(req.user, dto, idempotencyKey);
  }

  @Post('admin/process-outbox')
  @Roles(Role.ADMIN)
  processOutbox(@Body() body: { limit?: number } = {}) {
    return this.worker.processBatch(body?.limit || 20);
  }

  @Get('admin/outbox')
  @Roles(Role.ADMIN)
  listOutbox(@Query('limit') limit?: string) {
    return this.outbox.listRecent(Number(limit || 100));
  }
}

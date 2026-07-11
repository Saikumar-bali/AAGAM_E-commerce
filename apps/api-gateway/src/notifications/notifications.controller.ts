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
  const vapidKey = process.env.FIREBASE_WEB_VAPID_KEY || '';
  const requiredValues = [
    firebaseConfig.apiKey,
    firebaseConfig.projectId,
    firebaseConfig.messagingSenderId,
    firebaseConfig.appId,
    vapidKey,
  ];
  const enabled = requiredValues.every((value) => value.trim().length > 0);

  return {
    enabled,
    vapidKey: enabled ? vapidKey : null,
    firebaseConfig: enabled ? firebaseConfig : null,
    missing: enabled
      ? []
      : [
          !firebaseConfig.apiKey && 'FIREBASE_WEB_API_KEY',
          !firebaseConfig.projectId && 'FIREBASE_WEB_PROJECT_ID',
          !firebaseConfig.messagingSenderId && 'FIREBASE_WEB_MESSAGING_SENDER_ID',
          !firebaseConfig.appId && 'FIREBASE_WEB_APP_ID',
          !vapidKey && 'FIREBASE_WEB_VAPID_KEY',
        ].filter(Boolean),
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
  inbox(@Req() req: any, @Query('limit') limit?: string) {
    return this.notifications.listInbox(req.user, limit);
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

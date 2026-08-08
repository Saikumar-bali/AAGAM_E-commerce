import { Module } from '@nestjs/common';
import { WhatsAppCloudService } from './whatsapp-cloud.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppCloudService, WhatsAppWebhookService],
  exports: [WhatsAppCloudService],
})
export class WhatsAppWebhookModule {}

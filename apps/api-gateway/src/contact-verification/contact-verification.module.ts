import { Module } from '@nestjs/common';
import { WhatsAppWebhookModule } from '../whatsapp-webhook/whatsapp-webhook.module';
import { ContactDeliveryService } from './contact-delivery.service';
import { ContactOtpService } from './contact-otp.service';

@Module({
  imports: [WhatsAppWebhookModule],
  providers: [ContactDeliveryService, ContactOtpService],
  exports: [WhatsAppWebhookModule, ContactDeliveryService, ContactOtpService],
})
export class ContactVerificationModule {}

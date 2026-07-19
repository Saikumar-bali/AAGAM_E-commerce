import { Module } from '@nestjs/common';
import { ContactDeliveryService } from './contact-delivery.service';
import { ContactOtpService } from './contact-otp.service';

@Module({
  providers: [ContactDeliveryService, ContactOtpService],
  exports: [ContactDeliveryService, ContactOtpService],
})
export class ContactVerificationModule {}

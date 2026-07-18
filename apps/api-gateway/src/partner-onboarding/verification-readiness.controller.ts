import { Controller, Get } from '@nestjs/common';
import { PartnerVerificationService } from './partner-verification.service';

@Controller('ready')
export class VerificationReadinessController {
  constructor(private readonly verification: PartnerVerificationService) {}

  @Get('verification')
  verificationReadiness() {
    return this.verification.readiness();
  }
}

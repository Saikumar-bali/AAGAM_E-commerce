import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ResumePartnerApplicationRequestDto,
  ResumePartnerApplicationVerifyDto,
} from './dto/partner-onboarding.dto';
import { PartnerApplicationRecoveryService } from './partner-application-recovery.service';

@Controller('partner-onboarding/resume')
@UseGuards(ThrottlerGuard)
export class PartnerApplicationRecoveryController {
  constructor(private readonly recovery: PartnerApplicationRecoveryService) {}

  @Post('request')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  request(@Body() dto: ResumePartnerApplicationRequestDto) {
    return this.recovery.request(dto.identifier);
  }

  @Post('verify')
  @Throttle({ short: { limit: 8, ttl: 60000 } })
  verify(@Body() dto: ResumePartnerApplicationVerifyDto) {
    return this.recovery.verify(dto.identifier, dto.code);
  }
}

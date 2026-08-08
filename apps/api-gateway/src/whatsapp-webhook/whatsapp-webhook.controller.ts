import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  RawBodyRequest,
  Req,
  Res,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@SkipThrottle()
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  constructor(private readonly webhook: WhatsAppWebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ) {
    const verifiedChallenge = this.webhook.verifySubscription(
      mode,
      verifyToken,
      challenge,
    );
    return response.status(200).type('text/plain').send(verifiedChallenge);
  }

  @Post()
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: Record<string, any>,
  ) {
    this.webhook.assertSignature(request.rawBody, signature);
    await this.webhook.handleEvent(body || {});
    return { received: true };
  }
}

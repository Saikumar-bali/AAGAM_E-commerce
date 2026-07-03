import { Body, Controller, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@aagam/database';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckoutQuoteDto, CheckoutPlaceOrderDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

@Controller('checkout')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('serviceability')
  async serviceability(@Req() req: Request, @Query('addressId') addressId: string) {
    const userId = (req as any).user?.id as string;
    return this.checkoutService.serviceability(userId, addressId);
  }

  @Post('quote')
  async quote(@Req() req: Request, @Body() dto: CheckoutQuoteDto) {
    const userId = (req as any).user?.id as string;
    return this.checkoutService.quote(userId, dto);
  }

  @Post('place-order')
  async placeOrder(
    @Req() req: Request,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CheckoutPlaceOrderDto,
  ) {
    const userId = (req as any).user?.id as string;
    return this.checkoutService.placeOrder(userId, dto, idempotencyKey);
  }
}

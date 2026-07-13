import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Role } from '@aagam/database';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SimulatedPaymentDto } from './dto/simulated-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // Temporary helper until a real gateway is integrated.
  @Post('simulated/capture')
  async capture(@Req() req: Request, @Body() dto: SimulatedPaymentDto) {
    const userId = (req as any).user?.id as string;
    return this.paymentsService.captureSimulatedPayment(userId, dto.orderId);
  }

  @Post('simulated/fail')
  async fail(@Req() req: Request, @Body() dto: SimulatedPaymentDto) {
    const userId = (req as any).user?.id as string;
    return this.paymentsService.failSimulatedPayment(userId, dto.orderId);
  }

  @Get(':orderId')
  async getPayment(@Req() req: Request, @Param('orderId') orderId: string) {
    const userId = (req as any).user?.id as string;
    return this.paymentsService.getPaymentByOrder(orderId, userId);
  }
}

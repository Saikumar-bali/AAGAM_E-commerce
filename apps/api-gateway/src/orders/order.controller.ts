import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { OrderService } from './order.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // Body-based assign for reliability
  @Patch('assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async assignOrderByBody(
    @Body() body: { orderId: string },
    @Req() req: any
  ) {
    return this.orderService.assignRider(body.orderId, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.orderService.findAll();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async findMyOrders(@Req() req: any) {
    return this.orderService.findMyOrders(req.user.id);
  }

  @Get('my/:id/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async findMyOrderTracking(@Req() req: any, @Param('id') id: string) {
    return this.orderService.getTracking(id, { id: req.user.id, role: Role.CUSTOMER });
  }

  @Get('my/:id')
  @UseGuards(JwtAuthGuard)
  async findMyOrder(@Req() req: any, @Param('id') id: string) {
    return this.orderService.findMyOrder(req.user.id, id);
  }

  @Patch('my/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async cancelMyOrder(@Req() req: any, @Param('id') id: string) {
    return this.orderService.cancelMyOrder(req.user.id, id);
  }

  @Get('rider/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async findRiderQueue(@Req() req: any) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    return this.orderService.findRecentForRiders(twoHoursAgo);
  }

  @Get('rider')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async findRiderOrders(@Req() req: any) {
    const { prisma } = await import('@aagam/database');
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!riderProfile) {
      return [];
    }
    return this.orderService.findByRiderId(riderProfile.id);
  }

  @Get(':id/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER)
  async findOrderTracking(@Req() req: any, @Param('id') id: string) {
    return this.orderService.getTracking(id, req.user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER, Role.CUSTOMER)
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.orderService.findOne(id, req.user);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.RIDER, Role.STORE_OWNER)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @Req() req: any,
  ) {
    return this.orderService.updateStatus(id, body.status, req.user, body.riderId);
  }
}

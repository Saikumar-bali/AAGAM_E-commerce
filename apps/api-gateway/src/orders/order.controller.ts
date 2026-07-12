import { Body, Controller, Get, GoneException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Role } from '@aagam/database';
import { OrderService } from './order.service';
import { DispatchService } from './dispatch.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { ForceCancelOrderDto } from './dto/force-cancel-order.dto';
import { ReassignRiderDto } from './dto/reassign-rider.dto';

@Controller('orders')
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly dispatchService: DispatchService,
  ) {}

  @Patch('assign')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  deprecatedSelfAssignment() {
    throw new GoneException(
      'Rider self-assignment has been removed. Open your dispatch offer and accept it through /orders/dispatch/assignments/:assignmentId/accept.',
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async findAll() {
    return this.orderService.findAll();
  }

  @Get('store')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STORE_OWNER)
  async findStoreOrders(@Req() req: any) {
    return this.orderService.findStoreOrders(req.user.id);
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
  deprecatedRiderQueue() {
    throw new GoneException(
      'Public rider queue is removed. Use the rider workspace at /orders/dispatch/rider/workspace for offers and active deliveries.',
    );
  }

  @Get('rider')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.RIDER)
  async findRiderOrders(@Req() req: any) {
    const { prisma } = await import('@aagam/database');
    const riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: req.user.id },
    });
    if (!riderProfile) return [];
    return this.orderService.findByRiderId(riderProfile.id);
  }

  @Patch(':id/force-cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async forceCancel(
    @Param('id') id: string,
    @Body() body: ForceCancelOrderDto,
    @Req() req: any,
  ) {
    return this.orderService.forceCancel(id, req.user, body.reason);
  }

  @Post(':id/reassign-rider')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async reassignRider(
    @Param('id') id: string,
    @Body() body: ReassignRiderDto,
    @Req() req: any,
  ) {
    return this.orderService.reassignRider(id, body.userId, req.user);
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
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @Req() req: any,
  ) {
    return this.orderService.updateStatus(id, body.status, req.user, body.riderId);
  }
}

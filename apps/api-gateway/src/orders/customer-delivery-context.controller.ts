import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('orders/my')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER)
export class CustomerDeliveryContextController {
  @Get(':orderId/delivery-context')
  async deliveryContext(@Param('orderId') orderId: string, @Req() req: any) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, customerId: req.user.id },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        deliveryJob: {
          select: {
            id: true,
            status: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    return {
      orderId: order.id,
      orderStatus: order.status,
      deliveryJobId: order.deliveryJob?.id || null,
      deliveryStatus: order.deliveryJob?.status || null,
      updatedAt: order.deliveryJob?.updatedAt || order.updatedAt,
    };
  }
}

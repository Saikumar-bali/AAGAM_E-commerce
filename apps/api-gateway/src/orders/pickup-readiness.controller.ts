import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role, prisma } from '@aagam/database';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

type ReadinessCaller = {
  id?: string;
  role?: Role;
  roles?: Role[];
};

export function canViewPickupReadiness(user: ReadinessCaller, storeOwnerId: string) {
  const callerRoles = new Set<Role>();
  if (user?.role) callerRoles.add(user.role);
  if (Array.isArray(user?.roles)) {
    user.roles.forEach((role) => callerRoles.add(role));
  }

  return callerRoles.has(Role.ADMIN) || user?.id === storeOwnerId;
}

@Controller('orders/delivery-operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PickupReadinessController {
  @Get('jobs/:deliveryJobId/pickup/readiness')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  async readiness(@Param('deliveryJobId') deliveryJobId: string, @Req() req: any) {
    const job = await prisma.deliveryJob.findUnique({
      where: { id: deliveryJobId },
      select: {
        id: true,
        status: true,
        order: {
          select: {
            store: { select: { ownerId: true } },
          },
        },
      },
    });

    if (!job) throw new NotFoundException('Delivery job not found');
    if (!canViewPickupReadiness(req.user, job.order.store.ownerId)) {
      throw new ForbiddenException('Only the owning store can view pickup readiness');
    }

    const task = await prisma.riderPickupTask.findUnique({
      where: { deliveryJobId },
      select: {
        status: true,
        verifiedAt: true,
        problemType: true,
        problemNote: true,
        updatedAt: true,
      },
    });

    return {
      deliveryJobId: job.id,
      deliveryStatus: job.status,
      ready: task?.status === 'VERIFIED',
      task: task || null,
    };
  }
}

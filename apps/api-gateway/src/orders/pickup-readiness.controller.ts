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

const readinessTaskSelect = {
  deliveryJobId: true,
  status: true,
  verifiedAt: true,
  problemType: true,
  problemNote: true,
  updatedAt: true,
} as const;

export function readinessCallerHasRole(user: ReadinessCaller, requiredRole: Role) {
  if (user?.role === requiredRole) return true;
  return Array.isArray(user?.roles) && user.roles.includes(requiredRole);
}

export function canViewPickupReadiness(user: ReadinessCaller, storeOwnerId: string) {
  return readinessCallerHasRole(user, Role.ADMIN) || user?.id === storeOwnerId;
}

function publicReadiness(job: { id: string; status: unknown }, task?: any) {
  return {
    deliveryJobId: job.id,
    deliveryStatus: job.status,
    ready: task?.status === 'VERIFIED',
    task: task
      ? {
          status: task.status,
          verifiedAt: task.verifiedAt,
          problemType: task.problemType,
          problemNote: task.problemNote,
          updatedAt: task.updatedAt,
        }
      : null,
  };
}

@Controller('orders/delivery-operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PickupReadinessController {
  @Get('pickup/readiness')
  @Roles(Role.ADMIN, Role.STORE_OWNER)
  async readinessQueue(@Req() req: any) {
    const isAdmin = readinessCallerHasRole(req.user, Role.ADMIN);
    if (!isAdmin && !req.user?.id) {
      throw new ForbiddenException('Only the owning store can view pickup readiness');
    }

    const jobs = await prisma.deliveryJob.findMany({
      where: {
        status: 'RIDER_AT_STORE' as any,
        ...(isAdmin ? {} : { order: { store: { ownerId: req.user.id } } }),
      } as any,
      select: { id: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (jobs.length === 0) return [];
    const jobIds = jobs.map((job) => job.id);
    const tasks = await prisma.riderPickupTask.findMany({
      where: { deliveryJobId: { in: jobIds } },
      select: readinessTaskSelect,
    });
    const taskByJobId = new Map(tasks.map((task) => [task.deliveryJobId, task]));

    return jobs.map((job) => publicReadiness(job, taskByJobId.get(job.id)));
  }

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
      select: readinessTaskSelect,
    });

    return publicReadiness(job, task);
  }
}

import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { Observable } from 'rxjs';
import {
  ArrivalEvidenceInput,
  riderArrivalPolicy,
  validateRiderArrivalEvidence,
} from './rider-arrival-evidence';

@Injectable()
export class RiderArrivalEvidenceInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<any>();
    const path = String(request.route?.path || request.originalUrl || '');
    const destinationType = path.includes('arrived-at-store')
      ? 'STORE'
      : path.includes('arrived-at-customer')
        ? 'CUSTOMER'
        : null;
    if (request.method !== 'PATCH' || !destinationType) return next.handle();

    const deliveryJobId = String(request.params?.deliveryJobId || '');
    const userId = String(request.user?.id || '');
    if (!deliveryJobId || !userId) throw new ForbiddenException('Authenticated Rider context is required');

    const [rider, job] = await Promise.all([
      prisma.riderProfile.findUnique({ where: { userId }, select: { id: true } }),
      prisma.deliveryJob.findUnique({
        where: { id: deliveryJobId },
        include: {
          order: {
            include: {
              store: {
                select: {
                  id: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
      }),
    ]);
    if (!rider) throw new NotFoundException('Rider profile not found');
    if (!job) throw new NotFoundException('Delivery job not found');
    if (job.currentRiderId !== rider.id) {
      throw new ForbiddenException('This delivery is not assigned to the authenticated Rider');
    }

    const destination = destinationType === 'STORE'
      ? {
          latitude: Number(job.order.store?.latitude),
          longitude: Number(job.order.store?.longitude),
        }
      : {
          latitude: Number(job.order.deliveryLat),
          longitude: Number(job.order.deliveryLng),
        };
    const validated = validateRiderArrivalEvidence({
      evidence: request.body as ArrivalEvidenceInput,
      destination,
      destinationType,
      policy: riderArrivalPolicy(destinationType),
    });

    request.user.arrivalEvidence = validated;
    request.body = {};
    return next.handle();
  }
}

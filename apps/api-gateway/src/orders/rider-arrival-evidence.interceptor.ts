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
  addressLocationSourceFromSnapshot,
  riderArrivalPolicy,
  riderTransitionEvidencePolicy,
  validateCustomerArrivalEvidence,
  validateRiderArrivalEvidence,
  validateRiderTransitionEvidence,
} from './rider-arrival-evidence';

@Injectable()
export class RiderArrivalEvidenceInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<any>();
    const path = String(request.route?.path || request.originalUrl || '');
    const transition = path.includes('en-route-to-store')
      ? { destinationType: 'STORE' as const, geofence: false }
      : path.includes('arrived-at-store')
        ? { destinationType: 'STORE' as const, geofence: true }
        : path.includes('out-for-delivery')
          ? { destinationType: 'CUSTOMER' as const, geofence: false }
          : path.includes('arrived-at-customer')
            ? { destinationType: 'CUSTOMER' as const, geofence: true }
            : null;
    if (request.method !== 'PATCH' || !transition) return next.handle();

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
                select: { id: true, latitude: true, longitude: true },
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

    const evidence = request.body as ArrivalEvidenceInput;
    const validated = transition.geofence
      ? transition.destinationType === 'STORE'
        ? validateRiderArrivalEvidence({
            evidence,
            destination: {
              latitude: Number(job.order.store?.latitude),
              longitude: Number(job.order.store?.longitude),
            },
            destinationType: 'STORE',
            policy: riderArrivalPolicy('STORE'),
          })
        : validateCustomerArrivalEvidence({
            evidence,
            destination: {
              latitude: Number(job.order.deliveryLat),
              longitude: Number(job.order.deliveryLng),
            },
            locationSource: addressLocationSourceFromSnapshot(job.order.addressSnapshot),
            policy: riderArrivalPolicy('CUSTOMER'),
          })
      : {
          ...validateRiderTransitionEvidence({
            evidence,
            policy: riderTransitionEvidencePolicy(),
          }),
          destinationType: transition.destinationType,
          geofenceRequired: false,
        };

    request.user.arrivalEvidence = validated;
    request.body = {};
    return next.handle();
  }
}

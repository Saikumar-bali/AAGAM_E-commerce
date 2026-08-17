import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { prisma } from '@aagam/database';
import { Observable } from 'rxjs';
import { readAddressLocationEvidence } from '../customer/address-location-evidence';

@Injectable()
export class TrustedDropAddressPolicyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<any>();
    if (request.method !== 'POST') return next.handle();

    const path = String(request.originalUrl || request.url || '');
    const isQuote = /\/subscriptions\/plans\/[^/?]+\/quote(?:\?|$)/.test(path);
    const isCreate = /\/customer\/subscriptions(?:\?|$)/.test(path);
    if (!isQuote && !isCreate) return next.handle();

    const body = request.body || {};
    if (body.deliveryMethod !== 'TRUSTED_DROP') return next.handle();
    const addressId = typeof body.addressId === 'string' ? body.addressId : '';
    if (!addressId) return next.handle();

    const evidence = await readAddressLocationEvidence(prisma, addressId);
    if (!['LIVE_GPS', 'MAP_PIN'].includes(evidence.source)) {
      throw new BadRequestException(
        'Trusted Drop requires a GPS-verified or map-pinned delivery address. Update this address with current location or an exact map pin first.',
      );
    }
    return next.handle();
  }
}

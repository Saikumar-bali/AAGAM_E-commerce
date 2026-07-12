import { ForbiddenException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { prisma, Role } from '@aagam/database';
import { readFileSync } from 'fs';
import path from 'path';
import { AuthController } from './auth/auth.controller';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { StoreService } from './stores/store.service';
import { UpdateStoreDto } from './stores/dto/update-store.dto';

describe('Phase 3 security regression gates', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects a valid JWT when the database user no longer exists', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as never);
    const strategy = new JwtStrategy({ get: () => 'test-jwt-secret' } as any);

    await expect(strategy.validate({ sub: 'deleted-user', email: 'deleted@example.test', role: Role.ADMIN }))
      .rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('keeps browser login cookie-only while mobile login returns a bearer token', async () => {
    const authService = {
      signIn: jest.fn().mockResolvedValue({
        session: { access_token: 'native-bearer-token' },
        user: { id: 'user-1', email: 'user@example.test', name: 'User', role: Role.CUSTOMER },
      }),
    };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
    const controller = new AuthController(authService as any);
    const dto = { email: 'user@example.test', password: 'valid-password' };

    const browserResult = await controller.signIn(dto, response);
    expect(browserResult).toEqual({
      message: 'Logged in successfully',
      user: expect.objectContaining({ id: 'user-1' }),
    });
    expect(browserResult).not.toHaveProperty('access_token');
    expect(response.cookie).toHaveBeenCalledWith(
      'access_token',
      'native-bearer-token',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );

    const mobileResult = await controller.mobileSignIn(dto);
    expect(mobileResult.access_token).toBe('native-bearer-token');
  });

  it('passes the authenticated customer id into payment reads', async () => {
    const payments = { getPaymentByOrder: jest.fn().mockResolvedValue({ id: 'payment-1' }) };
    const controller = new PaymentsController(payments as any);

    await controller.getPayment({ user: { id: 'customer-1' } } as any, 'order-1');

    expect(payments.getPaymentByOrder).toHaveBeenCalledWith('order-1', 'customer-1');
  });

  it('rejects a customer reading another customer payment', async () => {
    jest.spyOn(prisma.order, 'findUnique').mockResolvedValue({ customerId: 'customer-owner' } as never);
    const paymentLookup = jest.spyOn(prisma.payment, 'findUnique');
    const service = new PaymentsService();

    await expect(service.getPaymentByOrder('order-1', 'customer-attacker'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(paymentLookup).not.toHaveBeenCalled();
  });

  it('rejects non-whitelisted store update fields before the service is called', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

    await expect(pipe.transform(
      { name: 'Updated Store', ownerId: 'attacker-user' },
      { type: 'body', metatype: UpdateStoreDto } as any,
    )).rejects.toBeDefined();
  });

  it('allowlists store update fields even if the service is called with an unsafe object', async () => {
    const update = jest.spyOn(prisma.store, 'update').mockResolvedValue({ id: 'store-1' } as never);
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new StoreService(cache as any);

    await service.update('store-1', {
      name: 'Safe Name',
      ownerId: 'attacker-user',
      deletedAt: new Date(),
    } as any);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'store-1' },
      data: { name: 'Safe Name' },
    });
  });

  it('does not expose private owner credentials from public store queries', async () => {
    const findMany = jest.spyOn(prisma.store, 'findMany').mockResolvedValue([] as never);
    const cache = { del: jest.fn().mockResolvedValue(undefined) };
    const service = new StoreService(cache as any);

    await service.findAll();

    expect(findMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      include: {
        owner: { select: { id: true, name: true } },
        inventory: true,
      },
    });
  });

  it('uses credentialed cookie sockets and the API port in both admin realtime pages', () => {
    const dashboardRoot = path.resolve(__dirname, '../../admin-dashboard/src');
    const helper = readFileSync(path.join(dashboardRoot, 'lib/realtimeSocket.ts'), 'utf8');
    const riders = readFileSync(path.join(dashboardRoot, 'app/(admin)/admin/riders/page.tsx'), 'utf8');
    const orders = readFileSync(path.join(dashboardRoot, 'app/(admin)/admin/orders/page.tsx'), 'utf8');

    expect(helper).toContain("'http://localhost:3005'");
    expect(helper).toContain('withCredentials: true');
    expect(riders).toContain('createRealtimeSocket()');
    expect(orders).toContain('createRealtimeSocket()');
    expect(riders).not.toContain("io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')");
    expect(orders).not.toContain("io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000')");
  });

  it('keeps browser source free from localStorage bearer-token persistence', () => {
    const dashboardRoot = path.resolve(__dirname, '../../admin-dashboard/src');
    const login = readFileSync(path.join(dashboardRoot, 'app/(auth)/login/page.tsx'), 'utf8');
    const webClient = readFileSync(path.resolve(__dirname, '../../../packages/utils/src/api-client.ts'), 'utf8');
    const mobileAuth = readFileSync(path.resolve(__dirname, '../../../packages/mobile-shared/src/store/authStore.ts'), 'utf8');

    expect(login).not.toContain("localStorage.setItem('access_token'");
    expect(webClient).not.toContain("localStorage.getItem('access_token'");
    expect(mobileAuth).toContain("'/auth/mobile/login'");
    expect(mobileAuth).toContain("'/auth/mobile/google'");
  });
});

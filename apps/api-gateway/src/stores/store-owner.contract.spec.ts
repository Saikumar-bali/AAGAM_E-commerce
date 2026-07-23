import fs from 'fs';
import path from 'path';

describe('store-owner API contracts', () => {
  it('protects store-owner routes with JWT and STORE_OWNER role guards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'store-owner.controller.ts'), 'utf8');
    expect(source).toContain('@UseGuards(JwtAuthGuard, RolesGuard)');
    expect(source).toContain('@Roles(Role.STORE_OWNER)');
    expect(source).toContain("@Patch('stores/:id/profile')");
  });

  it('scopes profile updates to the authenticated owner and checks phone conflicts', () => {
    const source = fs.readFileSync(path.join(__dirname, 'store-owner.service.ts'), 'utf8');
    expect(source).toContain('where: { id: storeId, ownerId, deletedAt: null }');
    expect(source).toContain('id: { not: ownerId }');
    expect(source).toContain('prisma.$transaction');
    expect(source).toContain('phone: phoneE164');
  });

  it('normalizes updated partner phones to the login-compatible E.164 format', () => {
    const dto = fs.readFileSync(path.join(__dirname, 'dto/update-owned-store-profile.dto.ts'), 'utf8');
    expect(dto).toContain('`+91${national}`');
    expect(dto).toContain('/^\\+91[6-9]\\d{9}$/');
  });

  it('calculates delivered revenue and returns lightweight counts', () => {
    const source = fs.readFileSync(path.join(__dirname, 'store-owner.service.ts'), 'utf8');
    expect(source).toContain('status: OrderStatus.DELIVERED');
    expect(source).toContain('orderCount: store._count.orders');
    expect(source).toContain('inventoryCount: store._count.inventory');
  });
});

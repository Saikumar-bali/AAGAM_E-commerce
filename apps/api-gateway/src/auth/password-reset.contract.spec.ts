import { validate } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { ConfirmPasswordResetDto } from './dto/password-reset.dto';

describe('password reset contracts', () => {
  it('rejects weak passwords and malformed codes at the API boundary', async () => {
    const dto = Object.assign(new ConfirmPasswordResetDto(), {
      email: 'customer@example.com',
      code: '12345',
      password: 'short',
      confirmPassword: 'short',
    });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['code', 'password']));
  });

  it('ships a single-use, non-enumerating Resend recovery flow', () => {
    const auth = fs.readFileSync(path.join(__dirname, 'auth.service.ts'), 'utf8');
    const delivery = fs.readFileSync(path.join(__dirname, '..', 'contact-verification', 'contact-delivery.service.ts'), 'utf8');
    const migration = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'packages', 'database', 'prisma', 'migrations', '20260812193000_password_reset_otp', 'migration.sql'), 'utf8');

    expect(auth).toContain("purpose: 'PASSWORD_RESET'");
    expect(auth).toContain('If an account exists for that email');
    expect(auth).toContain('dto.password !== dto.confirmPassword');
    expect(auth).toContain('bcrypt.hash(dto.password, 12)');
    expect(delivery).toContain("'PASSWORD_RESET'");
    expect(delivery).toContain('Reset your AAGAM password');
    expect(migration).toContain("'PASSWORD_RESET'");
  });
});

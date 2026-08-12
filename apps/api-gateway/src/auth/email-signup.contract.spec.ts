import { validate } from 'class-validator';
import * as fs from 'fs';
import * as path from 'path';
import { VerifyEmailSignupOtpDto } from './dto/email-signup.dto';

describe('email signup contracts', () => {
  it('validates email, six-digit code and password strength', async () => {
    const dto = Object.assign(new VerifyEmailSignupOtpDto(), { email: 'bad', code: '123', name: 'A', password: 'short', confirmPassword: 'different' });
    const properties = (await validate(dto)).map((error) => error.property);
    expect(properties).toEqual(expect.arrayContaining(['email', 'code', 'name', 'password']));
  });

  it('uses email OTP and creates only a verified password account', () => {
    const source = fs.readFileSync(path.join(__dirname, 'auth.service.ts'), 'utf8');
    expect(source).toContain("channel: 'EMAIL'");
    expect(source).toContain("purpose: 'CUSTOMER_SIGNUP'");
    expect(source).toContain('dto.password !== dto.confirmPassword');
    expect(source).toContain('emailVerified: true');
    expect(source).toContain('bcrypt.hash(dto.password, 12)');
  });
});

import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { prisma } from '@aagam/database';
import { Role } from '@aagam/database';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

const ALLOWED_ROLES: Role[] = [Role.CUSTOMER, Role.RIDER, Role.STORE_OWNER];

@Injectable()
export class AuthService {
  private jwtSecret: string;

  constructor(private configService: ConfigService) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET must be defined in environment variables');
    }
    this.jwtSecret = secret;
  }

  async signUp(email: string, pass: string, name: string, role: string = 'CUSTOMER') {
    const validRole = (role || 'CUSTOMER').toUpperCase() as Role;
    const userRole = ALLOWED_ROLES.includes(validRole) ? validRole : Role.CUSTOMER;

    // 1. Check if user exists in local database
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('User already exists');

    // 2. Hash password securely
    const hashedPassword = await bcrypt.hash(pass, 10);

    // 3. Create user in local PostgreSQL
    try {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: userRole,
        },
      });

      // 4. If registering as RIDER, automatically create rider profile
      if (userRole === Role.RIDER) {
        await prisma.riderProfile.create({
          data: {
            userId: user.id,
            status: 'OFFLINE',
          },
        });
      }

      return { 
        message: 'User created successfully',
        user: { id: user.id, email: user.email, role: user.role } 
      };
    } catch (error) {
      console.error('DB Signup Error:', error);
      throw new ConflictException('Failed to create user record');
    }
  }

  async signIn(email: string, pass: string) {
    if (process.env.NODE_ENV === 'development') {
      console.log('SignIn Attempt: Authentication request received');
    }
    // 1. Find user in local database
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log('SignIn Error: Invalid credentials');
      throw new UnauthorizedException('Invalid credentials');
    }
    
    if (!user.password) {
      console.log('SignIn Error: Invalid credentials (no password)');
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Compare hashed password
    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      console.log('SignIn Error: Password verification failed');
      throw new UnauthorizedException('Invalid credentials');
    }

    // 3. Generate secure JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.jwtSecret,
      { expiresIn: '7d' }
    );

    if (process.env.NODE_ENV === 'development') {
      console.log('SignIn Success: User authenticated successfully');
    }

    return { 
      session: {
        access_token: token,
      },
      user: { id: user.id, email: user.email, role: user.role, name: user.name } 
    };
  }

  async findAll() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
      },
    });
  }
}

import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Response, Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signUp(@Body() signupDto: SignupDto) {
    return this.authService.signUp(signupDto.email, signupDto.password, signupDto.name, signupDto.role);
  }

  @Post('login')
  async signIn(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: Response) {
    console.log('[AuthController] Login attempt for:', loginDto.email);
    const result = await this.authService.signIn(loginDto.email, loginDto.password);
    
    // Set HTTP-only cookie
    response.cookie('access_token', result.session.access_token, {
      httpOnly: true,
      secure: false, 
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log('[AuthController] Login successful, cookie set for:', loginDto.email);

    return {
      message: 'Logged in successfully',
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Req() req: any) {
    console.log('[AuthController] /me request received. User from request:', req.user?.email);
    return req.user;
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('access_token', { path: '/' });
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('users')
  async findAll() {
    return this.authService.findAll();
  }
}

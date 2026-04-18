import { Controller, Post } from '@nestjs/common';
@Controller('auth')
export class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    @Post('signup')
    async signUp(
    @Body()
    body) {
        return this.authService.signUp(body.email, body.password, body.name);
    }
    @Post('login')
    async signIn(
    @Body()
    body) {
        return this.authService.signIn(body.email, body.password);
    }
}
//# sourceMappingURL=auth.controller.js.map
import { AuthService } from './auth.service';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    signUp(body: any): Promise<{
        auth: {
            user: import("@supabase/auth-js").User | null;
            session: import("@supabase/auth-js").Session | null;
        };
        profile: {
            email: string;
            id: string;
            phone: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    signIn(body: any): Promise<{
        session: import("@supabase/auth-js").Session;
        user: {
            email: string;
            id: string;
            phone: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
            createdAt: Date;
            updatedAt: Date;
        } | null;
    }>;
}
//# sourceMappingURL=auth.controller.d.ts.map
import { ConfigService } from '@nestjs/config';
export declare class AuthService {
    private configService;
    private supabase;
    constructor(configService: ConfigService);
    signUp(email: string, pass: string, name: string, role?: 'CUSTOMER' | 'RIDER' | 'STORE_OWNER'): Promise<{
        auth: {
            user: import("@supabase/supabase-js").AuthUser | null;
            session: import("@supabase/supabase-js").AuthSession | null;
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
    signIn(email: string, pass: string): Promise<{
        session: import("@supabase/supabase-js").AuthSession;
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
//# sourceMappingURL=auth.service.d.ts.map
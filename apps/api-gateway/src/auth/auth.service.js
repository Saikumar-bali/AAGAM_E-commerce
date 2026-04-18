import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { prisma } from '@aagam/database';
@Injectable()
export class AuthService {
    configService;
    supabase;
    constructor(configService) {
        this.configService = configService;
        this.supabase = createClient(this.configService.get('SUPABASE_URL') || '', this.configService.get('SUPABASE_ANON_KEY') || '');
    }
    async signUp(email, pass, name, role = 'CUSTOMER') {
        // 1. Create user in Supabase Auth
        const { data, error } = await this.supabase.auth.signUp({
            email,
            password: pass,
            options: {
                data: { full_name: name },
            },
        });
        if (error)
            throw new UnauthorizedException(error.message);
        if (!data.user)
            throw new UnauthorizedException('User creation failed');
        // 2. Sync to local database
        try {
            const user = await prisma.user.create({
                data: {
                    id: data.user.id, // Use the SAME ID as Supabase for security consistency
                    email,
                    name,
                    role: role,
                },
            });
            return { auth: data, profile: user };
        }
        catch (dbError) {
            // If DB sync fails, we might want to delete from Supabase, but for now, we log it
            throw new ConflictException('User already exists in profile database');
        }
    }
    async signIn(email, pass) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        if (error)
            throw new UnauthorizedException(error.message);
        // Fetch local profile to ensure user is valid in our system
        const profile = await prisma.user.findUnique({
            where: { id: data.user.id },
        });
        return { session: data.session, user: profile };
    }
}
//# sourceMappingURL=auth.service.js.map
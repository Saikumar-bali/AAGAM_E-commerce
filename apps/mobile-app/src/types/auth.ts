export type UserRole = 'CUSTOMER' | 'RIDER';

export interface AuthUser {
  id?: string;
  email?: string;
  name?: string;
  role: UserRole;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}


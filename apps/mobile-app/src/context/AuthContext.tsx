import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import {deleteItem, getItem, setItem} from 'react-native-sensitive-info';
import {apiClient} from '@aagam/utils';

import type {AuthState, AuthUser, UserRole} from '../types/auth';

type LoginPayload = {
  email: string;
  password: string;
  preferredRole: UserRole;
};

type AuthContextValue = {
  authState: AuthState;
  isBootstrapping: boolean;
  isLoggingIn: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
};

const TOKEN_KEY = 'aagam_access_token';
const ROLE_KEY = 'aagam_user_role';
const SENSITIVE_INFO_OPTIONS = {service: 'aagam'};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const normalizeRole = (value?: string | null): UserRole | null => {
  const role = value?.toUpperCase();
  if (role === 'CUSTOMER' || role === 'RIDER') {
    return role;
  }

  return null;
};

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [authState, setAuthState] = useState<AuthState>({token: null, user: null});
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [storedTokenItem, storedRoleItem] = await Promise.all([
          getItem(TOKEN_KEY, SENSITIVE_INFO_OPTIONS),
          getItem(ROLE_KEY, SENSITIVE_INFO_OPTIONS),
        ]);

        const storedToken = storedTokenItem?.value ?? null;
        const storedRole = storedRoleItem?.value ?? null;
        const role = normalizeRole(storedRole);
        if (storedToken && role) {
          setAuthState({
            token: storedToken,
            user: {role},
          });
        }
      } finally {
        setIsBootstrapping(false);
      }
    };

    bootstrap();
  }, []);

  const login = useCallback(async ({email, password, preferredRole}: LoginPayload) => {
    setIsLoggingIn(true);
    try {
      const response = await apiClient.post('/auth/login', {email, password});
      const token: string | undefined = response?.data?.session?.access_token;
      if (!token) {
        throw new Error('Missing access token in login response');
      }

      const apiUser = response?.data?.user || {};
      const resolvedRole = normalizeRole(apiUser.role) || preferredRole;
      const nextUser: AuthUser = {
        id: apiUser.id,
        email: apiUser.email,
        name: apiUser.name,
        role: resolvedRole,
      };

      await Promise.all([
        setItem(TOKEN_KEY, token, SENSITIVE_INFO_OPTIONS),
        setItem(ROLE_KEY, resolvedRole, SENSITIVE_INFO_OPTIONS),
      ]);

      setAuthState({token, user: nextUser});
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      deleteItem(TOKEN_KEY, SENSITIVE_INFO_OPTIONS),
      deleteItem(ROLE_KEY, SENSITIVE_INFO_OPTIONS),
    ]);
    setAuthState({token: null, user: null});
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      isBootstrapping,
      isLoggingIn,
      login,
      logout,
    }),
    [authState, isBootstrapping, isLoggingIn, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};

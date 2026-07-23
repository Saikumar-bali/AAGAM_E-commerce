export type StoredMobileSession<TUser = unknown> = {
  version: 1;
  user: TUser;
  token: string;
};

export const encodeStoredMobileSession = <TUser>(user: TUser, token: string): string =>
  JSON.stringify({ version: 1, user, token } satisfies StoredMobileSession<TUser>);

export const decodeStoredMobileSession = <TUser = unknown>(raw: string): StoredMobileSession<TUser> | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredMobileSession<TUser>>;
    const user = parsed?.user as any;
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';

    if (!token || !user || typeof user !== 'object' || typeof user.id !== 'string' || !user.id.trim()) {
      return null;
    }

    return {
      version: 1,
      user: parsed.user as TUser,
      token,
    };
  } catch {
    return null;
  }
};

export const shouldInvalidateStoredSession = (error: any): boolean => {
  const status = Number(error?.response?.status ?? error?.status);
  return status === 401;
};

import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

export const REALTIME_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

export function createRealtimeSocket(
  options: Partial<ManagerOptions & SocketOptions> = {},
): Socket {
  const isRelativeUrl = REALTIME_API_URL.startsWith('/');
  return io(REALTIME_API_URL, {
    withCredentials: true,
    transports: isRelativeUrl ? ['polling'] : ['websocket', 'polling'],
    ...options,
  });
}

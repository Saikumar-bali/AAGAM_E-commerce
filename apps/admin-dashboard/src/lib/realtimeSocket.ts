import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

export const REALTIME_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

export function createRealtimeSocket(
  options: Partial<ManagerOptions & SocketOptions> = {},
): Socket {
  return io(REALTIME_API_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    ...options,
  });
}

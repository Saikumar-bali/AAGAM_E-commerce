import { io, ManagerOptions, Socket, SocketOptions } from 'socket.io-client';

export const REALTIME_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

// Socket.IO returns the Socket instance from disconnect()/close() for chaining.
// React effect cleanup functions, however, must return void. Expose the shared
// web socket through a narrowed lifecycle interface so callers cannot
// accidentally return the Socket object from an effect destructor.
export type RealtimeSocket = Omit<Socket, 'disconnect' | 'close'> & {
  disconnect(): void;
  close(): void;
};

export function createRealtimeSocket(
  options: Partial<ManagerOptions & SocketOptions> = {},
): RealtimeSocket {
  const isRelativeUrl = REALTIME_API_URL.startsWith('/');
  return io(REALTIME_API_URL, {
    withCredentials: true,
    transports: isRelativeUrl ? ['polling'] : ['websocket', 'polling'],
    ...options,
  }) as unknown as RealtimeSocket;
}

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL } from '@env';
import { useAuthStore } from '../store/authStore';

const SOCKET_URL = (API_URL || 'https://aagam.accesscam.org/api')
  .replace(/\/+$/, '')
  .replace(/\/api$/, '');

export const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (!token) {
      setSocket(null);
      return;
    }

    const nextSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });
    setSocket(nextSocket);

    return () => {
      nextSocket.removeAllListeners();
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [token]);

  const emit = (event: string, data: unknown) => {
    socket?.emit(event, data);
  };
  const on = (event: string, callback: (...args: any[]) => void) => {
    socket?.on(event, callback);
  };
  const off = (event: string, callback?: (...args: any[]) => void) => {
    if (callback) {
      socket?.off(event, callback);
      return;
    }
    socket?.off(event);
  };

  return { socket, emit, on, off };
};

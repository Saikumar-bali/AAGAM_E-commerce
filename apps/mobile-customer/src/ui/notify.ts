import Toast from 'react-native-toast-message';
import { getUserSafeError } from './notifyCore';

const show = (
  type: 'success' | 'error' | 'info' | 'warning',
  title: string,
  message?: string,
  visibilityTime?: number,
) => {
  const defaultVisibility = type === 'success' ? 2500 : type === 'error' ? 4000 : 3000;
  const resolvedVisibility = typeof visibilityTime === 'number' ? visibilityTime : defaultVisibility;
  Toast.show({
    type,
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: resolvedVisibility,
    autoHide: true,
  });
};

export const notify = {
  success: (title: string, message?: string, visibilityTime?: number) => show('success', title, message, visibilityTime),
  error: (title: string, message?: string, visibilityTime?: number) => show('error', title, message, visibilityTime),
  info: (title: string, message?: string, visibilityTime?: number) => show('info', title, message, visibilityTime),
  warning: (title: string, message?: string, visibilityTime?: number) => show('warning', title, message, visibilityTime),
};

export { getUserSafeError };

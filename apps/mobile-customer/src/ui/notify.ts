import Toast from 'react-native-toast-message';
import { getUserSafeError } from './notifyCore';

const show = (
  type: 'success' | 'error' | 'info' | 'warning',
  title: string,
  message?: string,
) => {
  const visibilityTime = type === 'success' ? 2500 : type === 'error' ? 4000 : 3000;
  Toast.show({
    type,
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime,
    autoHide: true,
  });
};

export const notify = {
  success: (title: string, message?: string) => show('success', title, message),
  error: (title: string, message?: string) => show('error', title, message),
  info: (title: string, message?: string) => show('info', title, message),
  warning: (title: string, message?: string) => show('warning', title, message),
};

export { getUserSafeError };

/* Web mock for react-native-toast-message. Renders nothing, but logs so the
 * preview surfaces success/error toasts the app would otherwise show. */
export const Toast = () => null;
Toast.show = (opts = {}) => {
  // eslint-disable-next-line no-console
  console.log(`[toast:${opts.type || 'info'}] ${opts.text1 || ''}${opts.text2 ? ' — ' + opts.text2 : ''}`);
};
Toast.hide = () => undefined;

export const BaseToast = () => null;
export const SuccessToast = () => null;
export const ErrorToast = () => null;
export const InfoToast = () => null;

export default Toast;

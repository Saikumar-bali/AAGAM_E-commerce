import 'react-native-safe-area-context';

declare module 'react-native-safe-area-context' {
  export type PartnerSafeAreaInsets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  export function useSafeAreaInsets(): PartnerSafeAreaInsets;
}

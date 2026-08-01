import React from 'react';
import Svg, { Path } from 'react-native-svg';

export function GoogleG({ size = 22 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Google">
    <Path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.52v2.93h3.87c2.27-2.09 3.56-5.17 3.56-8.69Z" />
    <Path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.9l-3.87-2.93c-1.07.72-2.44 1.14-4.07 1.14-3.13 0-5.78-2.11-6.73-4.95H1.28v3.02A12 12 0 0 0 12 24Z" />
    <Path fill="#FBBC05" d="M5.27 14.36A7.2 7.2 0 0 1 4.9 12c0-.82.14-1.61.37-2.36V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.78 1.28 5.38l3.99-3.02Z" />
    <Path fill="#EA4335" d="M12 4.69c1.77 0 3.35.61 4.6 1.8l3.43-3.44A11.54 11.54 0 0 0 12 0 12 12 0 0 0 1.28 6.62l3.99 3.02C6.22 6.8 8.87 4.69 12 4.69Z" />
  </Svg>;
}

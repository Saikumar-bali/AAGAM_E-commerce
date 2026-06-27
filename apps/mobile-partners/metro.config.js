const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  watchFolders: [
    path.resolve(__dirname, '../..'),
  ],
  resolver: {
    extraNodeModules: {
      '@aagam/mobile-shared': path.resolve(__dirname, '../../packages/mobile-shared'),
      '@aagam/types': path.resolve(__dirname, '../../packages/types'),
      '@aagam/utils': path.resolve(__dirname, '../../packages/utils'),
    },
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);

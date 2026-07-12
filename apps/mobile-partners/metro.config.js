const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const rootModules = path.resolve(__dirname, '../../node_modules');

const config = {
  watchFolders: [
    path.resolve(__dirname, '../..'),
  ],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      rootModules,
    ],
    extraNodeModules: {
      'react': path.resolve(rootModules, 'react'),
      'react-dom': path.resolve(rootModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(rootModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(rootModules, 'react/jsx-dev-runtime'),
      '@aagam/mobile-shared': path.resolve(__dirname, '../../packages/mobile-shared'),
      '@aagam/types': path.resolve(__dirname, '../../packages/types'),
      '@aagam/utils': path.resolve(__dirname, '../../packages/utils'),
    },
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);

const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '../..');
const rootModules = path.resolve(monorepoRoot, 'node_modules');
const sharedPackages = [
  path.resolve(monorepoRoot, 'packages/mobile-shared'),
  path.resolve(monorepoRoot, 'packages/types'),
  path.resolve(monorepoRoot, 'packages/utils'),
];

const config = {
  projectRoot: __dirname,
  // Keep Metro away from unrelated web apps, reports, fixtures, and data.
  // Only source workspaces imported by AagamPartners and hoisted dependencies
  // need to be visible outside the app directory.
  watchFolders: [...sharedPackages, rootModules],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      rootModules,
    ],
    extraNodeModules: {
      react: path.resolve(rootModules, 'react'),
      'react-dom': path.resolve(rootModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(rootModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(rootModules, 'react/jsx-dev-runtime'),
      '@aagam/mobile-shared': sharedPackages[0],
      '@aagam/types': sharedPackages[1],
      '@aagam/utils': sharedPackages[2],
    },
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);

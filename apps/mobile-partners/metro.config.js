const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const monorepoRoot = path.resolve(__dirname, '../..');
const rootModules = path.resolve(monorepoRoot, 'node_modules');
const appModules = path.resolve(__dirname, 'node_modules');
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
      appModules,
      rootModules,
    ],
    extraNodeModules: {
      // Resolve react/react-dom to the app-local copy (React 19) instead of
      // the root node_modules copy (React 18, hoisted by the admin dashboard).
      // React Native 0.85 requires React 19 APIs — mixing versions causes
      // "Cannot read property 'S' of undefined" crashes in release builds.
      react: path.resolve(appModules, 'react'),
      'react-dom': path.resolve(appModules, 'react-dom'),
      'react/jsx-runtime': path.resolve(appModules, 'react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(appModules, 'react/jsx-dev-runtime'),
      '@aagam/mobile-shared': sharedPackages[0],
      '@aagam/types': sharedPackages[1],
      '@aagam/utils': sharedPackages[2],
    },
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        return {
          type: 'sourceFile',
          filePath: require.resolve(moduleName, { paths: [__dirname] }),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(defaultConfig, config);

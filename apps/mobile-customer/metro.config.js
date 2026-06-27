const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '../../');
const appReactPath = path.resolve(__dirname, 'node_modules/react');
const sharedPackages = [
  path.resolve(root, 'packages/types'),
  path.resolve(root, 'packages/utils'),
  path.resolve(root, 'packages/mobile-shared'),
  path.resolve(root, 'node_modules'),
];

const config = {
  projectRoot: __dirname,
  watchFolders: sharedPackages,
  resolver: {
    extraNodeModules: {
      react: appReactPath,
      '@aagam/types': path.resolve(root, 'packages/types'),
      '@aagam/utils': path.resolve(root, 'packages/utils'),
      '@aagam/mobile-shared': path.resolve(root, 'packages/mobile-shared'),
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
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(root, 'node_modules'),
    ],
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);

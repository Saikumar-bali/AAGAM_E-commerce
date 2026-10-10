/*eslint-disable*/
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const APP = process.env.APP || 'mobile-partners';
if (!['mobile-partners', 'mobile-customer'].includes(APP)) {
  throw new Error(`Unknown APP "${APP}" (expected mobile-partners or mobile-customer)`);
}

const ROOT = path.resolve(__dirname, '..');
const here = (p) => path.resolve(__dirname, p);
const appDir = path.resolve(ROOT, 'apps', APP);
const appModuleDir = path.resolve(appDir, 'node_modules');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3005';
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const BASE = `/preview/${APP}`;

module.exports = {
  mode: isProduction ? 'production' : 'development',
  target: ['web', 'es2019'],
  entry: here('src/index.js'),
  devtool: isProduction ? false : 'eval-source-map',
  output: {
    path: path.resolve(__dirname, 'dist', APP),
    filename: 'bundle.js',
    publicPath: `${BASE}/`,
    clean: true,
  },
  performance: { hints: false },
  stats: 'errors-warnings',
  ignoreWarnings: [/Failed to parse source map/],
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
    // Some published packages ship extensionless ESM imports; keep webpack lenient.
    fullySpecified: false,
    fallback: {
      process: here('mocks/process.js'),
    },
    alias: {
      '@env$': here('src/env.js'),
      '@app': appDir,
      'react-native$': here('mocks/react-native.js'),
      'react-native-webview$': here('mocks/webview.js'),
      'react-native-toast-message$': here('mocks/toast.js'),
      'react-native-geolocation-service$': here('mocks/geolocation.js'),
      'react-native-keychain$': here('mocks/keychain.js'),
      '@react-native-community/datetimepicker$': here('mocks/datetimepicker.js'),
      '@react-native-firebase/messaging$': here('mocks/firebase-messaging.js'),
      '@react-native-firebase/app$': here('mocks/firebase-messaging.js'),
      // Top-level react-native-screens is web-safe; the native-stack view that
      // actually needs the native module resolves to NativeStackView.native.js
      // which webpack never picks for the web platform.
      'react-native-screens$': 'react-native-web',
      'lucide-react-native$': 'lucide-react',
      // Reuse the real React Navigation builder; see mocks/navigation.js.
      '@react-navigation/native$': here('mocks/navigation.js'),
      '@react-navigation/native-stack$': here('mocks/navigation.js'),
      '@react-navigation/bottom-tabs$': here('mocks/navigation.js'),
      '@react-navigation/core$': path.resolve(ROOT, 'node_modules/@react-navigation/core'),
    },
    // The app resolves react/react-dom to the app-local copy; there is none in
    // the web build, so pin the single root React 19 copy.
    modules: [appModuleDir, path.resolve(ROOT, 'node_modules'), 'node_modules'],
  },
  module: {
    rules: [
      // Published ESM files sometimes import without extensions; allow it.
      {
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
      },
      {
        test: /\.[jt]sx?$/,
        include: [
          appDir,
          path.resolve(ROOT, 'packages/mobile-shared'),
          path.resolve(ROOT, 'packages/types'),
          path.resolve(ROOT, 'packages/utils'),
        ],
        use: {
          loader: 'babel-loader',
          options: {
            babelrc: false,
            configFile: false,
            cacheDirectory: true,
            presets: [
              ['@babel/preset-env', { targets: { chrome: '110' }, modules: false }],
              ['@babel/preset-typescript', { isTSX: true, allExtensions: true }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        },
      },
      {
        test: /\.(png|jpe?g|gif|svg|webp|ttf|otf|woff2?)$/,
        type: 'asset/resource',
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({ template: here('src/static/index.html') }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(NODE_ENV),
      __DEV__: JSON.stringify(!isProduction),
      'process.env.__AAGAM_API_URL__': JSON.stringify(API_URL),
      'process.env.__AAGAM_APP_VARIANT__': JSON.stringify(APP === 'mobile-customer' ? 'CUSTOMER' : 'PARTNERS'),
      'process.env.__AAGAM_APP_VERSION_CODE__': JSON.stringify('0'),
      'process.env.__AAGAM_MAPBOX_TOKEN__': JSON.stringify(MAPBOX_TOKEN),
      'process.env.__AAGAM_GOOGLE_WEB_CLIENT_ID__': JSON.stringify(process.env.GOOGLE_WEB_CLIENT_ID || ''),
      'process.env.__AAGAM_GOOGLE_ANDROID_CLIENT_ID__': JSON.stringify(process.env.GOOGLE_ANDROID_CLIENT_ID || ''),
      'process.env.__AAGAM_GOOGLE_MAPS_API_KEY__': JSON.stringify(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''),
    }),
    new webpack.ProvidePlugin({ process: here('mocks/process.js') }),
  ],
};

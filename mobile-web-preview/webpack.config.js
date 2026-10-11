/*eslint-disable*/
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const APP = process.env.APP || 'mobile-partners';
if (!['mobile-partners', 'mobile-customer', 'rider-map'].includes(APP)) {
  throw new Error(`Unknown APP "${APP}" (expected mobile-partners, mobile-customer or rider-map)`);
}

const ROOT = path.resolve(__dirname, '..');
const here = (p) => path.resolve(__dirname, p);
// `rider-map` is a small preview entry that mounts the real RiderRouteMap with
// mock data; it renders the partners app's components.
const APP_DIR_NAME = APP === 'rider-map' ? 'mobile-partners' : APP;
const appDir = path.resolve(ROOT, 'apps', APP_DIR_NAME);
const appModuleDir = path.resolve(appDir, 'node_modules');
const ENTRY = APP === 'rider-map' ? here('src/rider-map.js') : here('src/index.js');

const API_URL = process.env.API_URL || 'http://127.0.0.1:3005';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
// The harness serves two independent copies of every app from one origin:
//   /preview/<app>/  -> local api-gateway (API_URL=/api)
//   /live/<app>/     -> live origin (API_URL=/live/api)
// OUT_DIR / PUBLIC_BASE let the build emit the second copy under a distinct
// directory and asset prefix so the two never collide.
const PUBLIC_BASE = process.env.PUBLIC_BASE || '/preview';
const OUT_DIR = process.env.OUT_DIR || 'dist';
const BASE = `${PUBLIC_BASE}/${APP}`;

// No valid Mapbox public token ships with this repo (the only `pk.` values are
// test/dummy placeholders that the Mapbox API rejects with 401). When no real
// token is supplied at build time, swap the real Mapbox GL page for the
// token-free SVG mock so the in-app route maps still render the same window.*
// API (stop pins, route line, rider dot, progress) instead of a blank frame.
// Pass MAPBOX_TOKEN=pk.… at build time to use real Mapbox tiles.
const MAPBOX_TOKEN_BUILD = process.env.MAPBOX_TOKEN || process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';
const DUMMY_TOKENS = ['pk.test-dummy-token-for-jest', 'pk.eyJ1IjoiZmFsbGJhY2siLCJhIjoiY20wMCJ9.none'];
const USE_MAP_MOCK = !/^pk\.[A-Za-z0-9]/.test(MAPBOX_TOKEN_BUILD) || DUMMY_TOKENS.includes(MAPBOX_TOKEN_BUILD);

module.exports = {
  mode: isProduction ? 'production' : 'development',
  target: ['web', 'es2019'],
  entry: ENTRY,
  devtool: isProduction ? false : 'eval-source-map',
  output: {
    path: path.resolve(__dirname, OUT_DIR, APP),
    filename: 'bundle.js',
    publicPath: `${BASE}/`,
    clean: true,
  },
  performance: { hints: false },
  stats: 'errors-warnings',
  // The native map resolvers return a usable (test) token only when
  // NODE_ENV==='test'; drive webpack's own NODE_ENV definition from here so we
  // don't register a second conflicting `process.env.NODE_ENV` define below.
  optimization: { nodeEnv: 'test' },
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
    // Swap the real Mapbox GL page for the token-free SVG mock only when no
    // valid token is supplied; with a real MAPBOX_TOKEN the real map renders.
    // The apps import it relatively (`./riderRouteMapHtml`), so match the bare
    // trailing module name — no leading-slash requirement (a `.` precedes it).
    ...(USE_MAP_MOCK
      ? [new webpack.NormalModuleReplacementPlugin(/riderRouteMapHtml(\.\w+)?$/, here('mocks/rider-route-map-html.js'))]
      : []),
    // The partner apps' document/photo picker is Android-only (NativeModules);
    // swap it for a browser file-input shim so capture flows work in preview.
    new webpack.NormalModuleReplacementPlugin(/PartnerDocumentPicker$/, here('mocks/partner-document-picker.js')),
    new webpack.DefinePlugin({
      __DEV__: JSON.stringify(!isProduction),
      'process.env.__AAGAM_API_URL__': JSON.stringify(API_URL),
      'process.env.__AAGAM_APP_VARIANT__': JSON.stringify(APP === 'mobile-customer' ? 'CUSTOMER' : 'PARTNERS'),
      'process.env.__AAGAM_APP_VERSION_CODE__': JSON.stringify('0'),
      // The real map page reads process.env.EXPO_PUBLIC_MAPBOX_TOKEN; webpack
      // does not populate process.env, so bake the public client keys here or
      // the map silently falls back to the dummy token and renders blank.
      'process.env.EXPO_PUBLIC_MAPBOX_TOKEN': JSON.stringify(MAPBOX_TOKEN_BUILD),
      'process.env.NEXT_PUBLIC_MAPBOX_TOKEN': JSON.stringify(MAPBOX_TOKEN_BUILD),
      'process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''),
      'process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY': JSON.stringify(process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || ''),
      'process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID': JSON.stringify(process.env.GOOGLE_WEB_CLIENT_ID || ''),
    }),
    new webpack.ProvidePlugin({ process: here('mocks/process.js') }),
  ],
};

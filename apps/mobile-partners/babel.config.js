module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [require.resolve('react-native-dotenv'), { moduleName: '@env', path: '.env' }],
  ],
};

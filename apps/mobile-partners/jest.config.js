module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/src/**/*.spec.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  clearMocks: true,
  restoreMocks: true,
};

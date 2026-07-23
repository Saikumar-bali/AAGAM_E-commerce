const path = require('path');

const localReact = path.resolve(__dirname, 'node_modules/react');

module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^react$': localReact,
    '^react/(.*)$': path.resolve(__dirname, 'node_modules/react/$1'),
  },
};

/** @type {import('ts-jest').JestConfigWithTsJest} */
// Fast unit suite: specs colocated with the source they exercise.
module.exports = {
  displayName: 'unit',
  moduleFileExtensions: ['ts', 'js', 'json'],
  rootDir: '.',
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

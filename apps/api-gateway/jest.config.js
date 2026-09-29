/** @type {import('ts-jest').JestConfigWithTsJest} */
// Full suite: colocated unit specs under src/ plus integration/contract
// specs under test/. Integration specs share a database and must not run
// concurrently, hence --runInBand in the npm scripts.
module.exports = {
  projects: [
    '<rootDir>/jest.unit.config.js',
    '<rootDir>/test/jest-e2e.json',
  ],
};

// Screen and component tests run in jest-expo, which renders React Native components with Expo's mocks.
// Plain logic tests stay in Vitest (test/*.test.ts), run from the repository root.
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/test/screens/**/*.test.tsx'],
};

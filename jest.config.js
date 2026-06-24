/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  // The renderer is tested separately (jsdom); main/shared run under node.
  // `/\._` ignores macOS AppleDouble sidecar files created on non-HFS volumes.
  testPathIgnorePatterns: ['/node_modules/', '/src/renderer/', '/\\._'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
};

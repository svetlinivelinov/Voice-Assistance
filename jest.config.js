module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/packages", "<rootDir>/services"],
  testMatch: ["**/tests/**/*.test.js"],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 65,
      lines: 75,
      statements: 75
    }
  },
  collectCoverageFrom: [
    "packages/**/*.js",
    "services/**/*.js",
    "!**/node_modules/**",
    "!**/tests/**"
  ]
};
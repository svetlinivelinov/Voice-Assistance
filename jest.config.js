module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/packages", "<rootDir>/services"],
  testMatch: ["**/tests/**/*.test.js"],
  coverageDirectory: "coverage",
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 60,
      lines: 70,
      statements: 70
    }
  },
  collectCoverageFrom: [
    "packages/**/*.js",
    "services/**/*.js",
    "!**/node_modules/**",
    "!**/tests/**"
  ]
};
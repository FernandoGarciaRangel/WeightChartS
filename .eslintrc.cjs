module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  globals: {
    Chart: 'readonly',
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {},
};

import '@testing-library/jest-dom';

// amazon-cognito-identity-js needs `global` in browser-like environments
(globalThis as any).global = globalThis;

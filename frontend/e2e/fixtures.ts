import { test as base } from '@playwright/test';

// Re-export everything from base so tests can import from fixtures.ts
export { expect } from '@playwright/test';

// Authenticated test fixture — storageState is provided by playwright.config.ts
// so the `page` object here is already authenticated.
export const test = base.extend({});

/**
 * TS-01 Authentication tests
 * AUTH-01 through AUTH-08
 */
import { test, expect } from '@playwright/test';

// These tests manage their own auth state — use a fresh context (no storageState)
test.use({ storageState: { cookies: [], origins: [] } });

test('AUTH-01: login with valid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('analyst1@ravenwatch.local');
  await page.getByLabel('Password').fill('changeme123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await page.waitForURL('/', { timeout: 15000 });

  const token = await page.evaluate(() => localStorage.getItem('rw_token'));
  expect(token).toBeTruthy();
});

test('AUTH-02: login with invalid password shows error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('analyst1@ravenwatch.local');
  await page.getByLabel('Password').fill('wrongpassword');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Should stay on /login
  await expect(page).toHaveURL(/\/login/, { timeout: 10000 });

  // Error message shown
  const error = page.locator('p.text-red-400, [class*="text-red"]').first();
  await expect(error).toBeVisible({ timeout: 10000 });
});

test('AUTH-03: login with empty fields shows validation', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // HTML5 required fields prevent submission — still on /login
  await expect(page).toHaveURL(/\/login/);

  // Either HTML5 validation kicks in or an error is shown
  const emailInput = page.getByLabel('Email');
  const isValid = await emailInput.evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(isValid).toBe(false);
});

test('AUTH-04: logout clears token and redirects to /login', async ({ page }) => {
  // Log in first
  await page.goto('/login');
  await page.getByLabel('Email').fill('analyst1@ravenwatch.local');
  await page.getByLabel('Password').fill('changeme123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/', { timeout: 15000 });

  // Click logout
  await page.getByRole('button', { name: 'Logout' }).click();
  await page.waitForURL(/\/login/, { timeout: 10000 });

  // Token should be gone
  const token = await page.evaluate(() => localStorage.getItem('rw_token'));
  expect(token).toBeNull();
});

test('AUTH-05: protected route (/) redirects to /login without token', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-06: protected route (/entities) redirects to /login without token', async ({ page }) => {
  await page.goto('/entities');
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-07: protected route (/settings) redirects to /login without token', async ({ page }) => {
  await page.goto('/settings');
  await page.waitForURL(/\/login/, { timeout: 15000 });
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-08: session persists after page reload', async ({ page }) => {
  // Log in
  await page.goto('/login');
  await page.getByLabel('Email').fill('analyst1@ravenwatch.local');
  await page.getByLabel('Password').fill('changeme123');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('/', { timeout: 15000 });

  // Reload
  await page.reload();

  // Should still be on dashboard (not redirected to login)
  await expect(page).toHaveURL('/', { timeout: 10000 });
});

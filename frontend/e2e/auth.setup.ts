import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/analyst1.json');

setup('authenticate as analyst1', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('analyst1@ravenwatch.local');
  await page.getByLabel('Password').fill('changeme123');
  await page.getByRole('button', { name: 'Sign In' }).click();

  // Wait until redirected to dashboard
  await page.waitForURL('/', { timeout: 15000 });

  // Verify token is in localStorage
  const token = await page.evaluate(() => localStorage.getItem('rw_token'));
  expect(token).toBeTruthy();

  // Save storage state (includes localStorage + cookies)
  await page.context().storageState({ path: authFile });
});

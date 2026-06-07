/**
 * TS-09 Navigation
 * NAV-01 through NAV-03
 */
import { test, expect } from './fixtures';

test('NAV-01: NavBar is visible on all pages', async ({ page }) => {
  const pages = ['/', '/entities', '/settings'];

  for (const path of pages) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');

    // RavenWatch logo/link
    const logo = page.getByRole('link', { name: 'RavenWatch' });
    await expect(logo).toBeVisible({ timeout: 10000 });

    // Nav links
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entities' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
  }
});

test('NAV-02: active tab is highlighted on each page', async ({ page }) => {
  // Dashboard
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const dashboardLink = page.getByRole('link', { name: 'Dashboard' });
  const dashboardClass = await dashboardLink.getAttribute('class');
  expect(dashboardClass).toContain('blue');

  // Entities
  await page.goto('/entities');
  await page.waitForLoadState('networkidle');
  const entitiesLink = page.getByRole('link', { name: 'Entities' });
  const entitiesClass = await entitiesLink.getAttribute('class');
  expect(entitiesClass).toContain('blue');

  // Settings
  await page.goto('/settings');
  await page.waitForLoadState('networkidle');
  const settingsLink = page.getByRole('link', { name: 'Settings' });
  const settingsClass = await settingsLink.getAttribute('class');
  expect(settingsClass).toContain('blue');
});

test('NAV-03: clicking RavenWatch logo navigates to dashboard', async ({ page }) => {
  // Start on entities page
  await page.goto('/entities');
  await page.waitForLoadState('networkidle');

  const logo = page.getByRole('link', { name: 'RavenWatch' });
  await logo.click();

  await expect(page).toHaveURL('/', { timeout: 10000 });
});

/**
 * TS-07 Settings
 * SETTINGS-01 through SETTINGS-08
 */
import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=Loading settings...')).not.toBeVisible({ timeout: 15000 });
});

test('SETTINGS-01: settings page loads with retention and frequency fields', async ({ page }) => {
  const retentionInput = page.getByLabel('Article Retention (days)');
  const frequencyInput = page.getByLabel('Scraper Frequency (hours)');

  await expect(retentionInput).toBeVisible({ timeout: 10000 });
  await expect(frequencyInput).toBeVisible({ timeout: 10000 });
});

test('SETTINGS-02: inputs show current DB values', async ({ page }) => {
  const retentionInput = page.getByLabel('Article Retention (days)');
  const frequencyInput = page.getByLabel('Scraper Frequency (hours)');

  const retentionVal = await retentionInput.inputValue();
  const frequencyVal = await frequencyInput.inputValue();

  // Values should be numeric and within valid ranges
  expect(Number(retentionVal)).toBeGreaterThanOrEqual(7);
  expect(Number(retentionVal)).toBeLessThanOrEqual(365);
  expect(Number(frequencyVal)).toBeGreaterThanOrEqual(1);
  expect(Number(frequencyVal)).toBeLessThanOrEqual(168);
});

test('SETTINGS-03: saving retention days shows success toast', async ({ page }) => {
  const retentionInput = page.getByLabel('Article Retention (days)');
  await retentionInput.clear();
  await retentionInput.fill('60');

  await page.getByRole('button', { name: 'Save Settings' }).click();

  // Toast should appear
  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });
});

test('SETTINGS-04: retention value persists after reload', async ({ page }) => {
  // Set retention to 45
  const retentionInput = page.getByLabel('Article Retention (days)');
  await retentionInput.clear();
  await retentionInput.fill('45');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });

  // Reload page
  await page.reload();
  await expect(page.locator('text=Loading settings...')).not.toBeVisible({ timeout: 15000 });

  const reloadedValue = await page.getByLabel('Article Retention (days)').inputValue();
  expect(Number(reloadedValue)).toBe(45);

  // Restore original (30 days)
  const retentionInputRestore = page.getByLabel('Article Retention (days)');
  await retentionInputRestore.clear();
  await retentionInputRestore.fill('30');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });
});

test('SETTINGS-05: saving scraper frequency shows success toast', async ({ page }) => {
  const frequencyInput = page.getByLabel('Scraper Frequency (hours)');
  await frequencyInput.clear();
  await frequencyInput.fill('12');

  await page.getByRole('button', { name: 'Save Settings' }).click();

  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });
});

test('SETTINGS-06: frequency value persists after reload', async ({ page }) => {
  const frequencyInput = page.getByLabel('Scraper Frequency (hours)');
  await frequencyInput.clear();
  await frequencyInput.fill('12');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });

  await page.reload();
  await expect(page.locator('text=Loading settings...')).not.toBeVisible({ timeout: 15000 });

  const reloadedValue = await page.getByLabel('Scraper Frequency (hours)').inputValue();
  expect(Number(reloadedValue)).toBe(12);

  // Restore to 24
  const frequencyInputRestore = page.getByLabel('Scraper Frequency (hours)');
  await frequencyInputRestore.clear();
  await frequencyInputRestore.fill('24');
  await page.getByRole('button', { name: 'Save Settings' }).click();
  await expect(page.locator('text=Settings saved.')).toBeVisible({ timeout: 10000 });
});

test('SETTINGS-07: retention below min (6) triggers validation', async ({ page }) => {
  const retentionInput = page.getByLabel('Article Retention (days)');
  await retentionInput.clear();
  await retentionInput.fill('6');

  await page.getByRole('button', { name: 'Save Settings' }).click();

  // HTML5 min validation should prevent form submission
  const isValid = await retentionInput.evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(isValid).toBe(false);

  // Toast should NOT appear (save was blocked)
  await expect(page.locator('text=Settings saved.')).not.toBeVisible();
});

test('SETTINGS-08: retention above max (366) triggers validation', async ({ page }) => {
  const retentionInput = page.getByLabel('Article Retention (days)');
  await retentionInput.clear();
  await retentionInput.fill('366');

  await page.getByRole('button', { name: 'Save Settings' }).click();

  // HTML5 max validation should prevent form submission
  const isValid = await retentionInput.evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(isValid).toBe(false);

  await expect(page.locator('text=Settings saved.')).not.toBeVisible();
});

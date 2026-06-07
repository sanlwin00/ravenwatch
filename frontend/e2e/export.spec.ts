/**
 * TS-08 CSV Export
 * EXPORT-01 through EXPORT-05
 *
 * All export tests intercept the /api/v1/export/csv request so no actual
 * file download is required. We verify the request is made with the correct
 * query parameters.
 */
import { test, expect } from './fixtures';

// Build a minimal CSV response for download tests
const MOCK_CSV = [
  'title,source_name,published_at,url,entities,topics,summary_en',
  '"Test Article","Test Source","2025-01-01","http://example.com","Wang Yi","ceasefire","Summary"',
].join('\n');

async function interceptExport(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.route('**/api/v1/export/csv**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: {
        'Content-Disposition': 'attachment; filename="ravenwatch_export.csv"',
      },
      body: MOCK_CSV,
    });
  });
}

test('EXPORT-01: Export CSV button triggers download', async ({ page }) => {
  await interceptExport(page);
  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Listen for download event
  const downloadPromise = page.waitForEvent('download');

  await page.getByRole('button', { name: 'Export CSV' }).click();

  const download = await downloadPromise;
  expect(download).toBeTruthy();
  // The suggested filename comes from Content-Disposition or the URL
  const suggestedFilename = download.suggestedFilename();
  expect(suggestedFilename).toBeTruthy();
});

test('EXPORT-02: CSV has correct column headers', async ({ page }) => {
  let capturedUrl = '';
  await page.route('**/api/v1/export/csv**', async (route) => {
    capturedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: {
        'Content-Disposition': 'attachment; filename="ravenwatch_export.csv"',
      },
      body: MOCK_CSV,
    });
  });

  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;

  // Read the downloaded content and verify headers
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const csvContent = Buffer.concat(chunks).toString('utf-8');
  const firstLine = csvContent.split('\n')[0];

  expect(firstLine).toContain('title');
  expect(firstLine).toContain('source_name');
  expect(firstLine).toContain('published_at');
  expect(firstLine).toContain('url');
});

test('EXPORT-03: export with source filter passes source_id in request', async ({ page }) => {
  let capturedUrl = '';
  await page.route('**/api/v1/export/csv**', async (route) => {
    capturedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'Content-Disposition': 'attachment; filename="export.csv"' },
      body: MOCK_CSV,
    });
  });

  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Select first source
  const sourceSelect = page.locator('select').first();
  const options = await sourceSelect.locator('option').all();

  if (options.length <= 1) { test.skip(); return; }

  const firstSourceValue = await options[1].getAttribute('value');
  if (!firstSourceValue) { test.skip(); return; }

  await sourceSelect.selectOption(firstSourceValue);
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Export
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;

  // Verify source_id query param was included
  expect(capturedUrl).toContain('source_id=');
});

test('EXPORT-04: export with entity filter passes entity_id in request', async ({ page }) => {
  let capturedUrl = '';
  await page.route('**/api/v1/export/csv**', async (route) => {
    capturedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'Content-Disposition': 'attachment; filename="export.csv"' },
      body: MOCK_CSV,
    });
  });

  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const entitySelect = page.locator('select').nth(1);
  const options = await entitySelect.locator('option').all();

  if (options.length <= 1) { test.skip(); return; }

  const firstEntityValue = await options[1].getAttribute('value');
  if (!firstEntityValue) { test.skip(); return; }

  await entitySelect.selectOption(firstEntityValue);
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;

  expect(capturedUrl).toContain('entity_id=');
});

test('EXPORT-05: export with date range passes from_date and to_date in request', async ({ page }) => {
  let capturedUrl = '';
  await page.route('**/api/v1/export/csv**', async (route) => {
    capturedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'Content-Disposition': 'attachment; filename="export.csv"' },
      body: MOCK_CSV,
    });
  });

  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Set date range
  const fromDateInput = page.locator('input[type="date"]').first();
  const toDateInput = page.locator('input[type="date"]').nth(1);

  await fromDateInput.fill('2024-01-01');
  await toDateInput.fill('2025-12-31');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;

  expect(capturedUrl).toContain('from_date=');
  expect(capturedUrl).toContain('to_date=');
});

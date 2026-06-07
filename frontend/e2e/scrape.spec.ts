/**
 * TS-04 Manual Scrape
 * SCRAPE-01 through SCRAPE-04
 *
 * All scrape tests mock POST /api/v1/scrape so no real sources are hit.
 */
import { test, expect } from './fixtures';

// Intercept the scrape endpoint for all tests in this file
async function mockScrape(page: ReturnType<typeof test['extend']> extends never ? never : Parameters<Parameters<typeof test>[1]>[0]['page']) {
  await page.route('**/api/v1/scrape', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'started', message: 'Scrape initiated for 15 sources' }),
      });
    } else {
      await route.continue();
    }
  });
}

test('SCRAPE-01: Run Scrape button is visible on dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const runScrapeBtn = page.getByRole('button', { name: /Run Scrape/i });
  await expect(runScrapeBtn).toBeVisible({ timeout: 10000 });
});

test('SCRAPE-02: clicking Run Scrape shows loading state and banner', async ({ page }) => {
  await mockScrape(page);
  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const runScrapeBtn = page.getByRole('button', { name: /Run Scrape/i });
  await expect(runScrapeBtn).toBeVisible({ timeout: 10000 });

  await runScrapeBtn.click();

  // Button should show "Scraping..." while in progress
  await expect(page.getByRole('button', { name: /Scraping/i })).toBeVisible({ timeout: 5000 });

  // Banner should appear with "Scraping sources" message
  const banner = page.locator('text=Scraping sources');
  await expect(banner).toBeVisible({ timeout: 5000 });
});

test('SCRAPE-03: articles appear in feed after scrape (mocked poll)', async ({ page }) => {
  // Mock scrape endpoint
  await mockScrape(page);

  // Set up article mock — first call returns 0, second returns 1
  let callCount = 0;
  await page.route('**/api/v1/articles**', async (route) => {
    callCount++;
    if (callCount === 1) {
      // Initial load — empty
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ articles: [], total: 0 }),
      });
    } else {
      // After scrape poll — one article
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          articles: [
            {
              id: 1,
              title: 'Test Article After Scrape',
              url: 'http://example.com/article/1',
              source: { id: 1, name: 'Test Source', url: 'http://example.com', language: 'en' },
              published_at: '2025-01-01T00:00:00Z',
              raw_text_en: 'Test content',
              early_signal: false,
              policy_signal: false,
              entities: [],
              topics: [],
            },
          ],
          total: 1,
        }),
      });
    }
  });

  await page.goto('/');
  // Wait for initial empty state
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Click Run Scrape
  const runScrapeBtn = page.getByRole('button', { name: /Run Scrape/i });
  await expect(runScrapeBtn).toBeVisible({ timeout: 5000 });
  await runScrapeBtn.click();

  // Wait for article to appear (poll cycle is 5s in app, but with mocked routes it resolves quickly)
  await expect(page.locator('text=Test Article After Scrape')).toBeVisible({ timeout: 15000 });
});

test('SCRAPE-04: dismissing scrape banner removes it', async ({ page }) => {
  await mockScrape(page);
  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const runScrapeBtn = page.getByRole('button', { name: /Run Scrape/i });
  await runScrapeBtn.click();

  // Wait for banner
  const banner = page.locator('text=Scraping sources').locator('..');
  await expect(banner).toBeVisible({ timeout: 5000 });

  // Click the dismiss (×) button
  const dismissBtn = page.getByRole('button', { name: 'Dismiss' });
  await dismissBtn.click();

  // Banner should disappear
  await expect(page.locator('text=Scraping sources')).not.toBeVisible({ timeout: 5000 });
});

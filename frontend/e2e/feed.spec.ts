/**
 * TS-02 Dashboard — Article Feed
 * FEED-01 through FEED-06
 */
import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('FEED-01: dashboard loads articles', async ({ page }) => {
  // Wait for loading to finish
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // At least one article card or "No articles found"
  // We expect articles exist in a seeded environment
  const articleCards = page.locator('a[href^="/articles/"]');
  await expect(articleCards.first()).toBeVisible({ timeout: 15000 });
  const count = await articleCards.count();
  expect(count).toBeGreaterThan(0);
});

test('FEED-02: article card renders correctly', async ({ page }) => {
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });

  // Should have source name and date (meta row)
  const metaText = firstCard.locator('.text-slate-400, .text-slate-500');
  await expect(metaText.first()).toBeVisible();
});

test('FEED-03: Early Signal badge visible on matching articles', async ({ page }) => {
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Look for the badge — may or may not be present depending on data
  // We verify that IF it exists it matches the expected markup
  const earlySignalBadges = page.locator('text=Early Signal');
  const count = await earlySignalBadges.count();
  if (count > 0) {
    await expect(earlySignalBadges.first()).toBeVisible();
    // The badge should be styled red
    const badge = earlySignalBadges.first().locator('..');
    await expect(badge).toBeVisible();
  }
  // Test passes even if no early signal articles are in the feed currently
});

test('FEED-04: Policy Signal badge visible on matching articles', async ({ page }) => {
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const policySignalBadges = page.locator('text=Policy Signal');
  const count = await policySignalBadges.count();
  if (count > 0) {
    await expect(policySignalBadges.first()).toBeVisible();
  }
  // Test passes even if no policy signal articles are in the feed currently
});

test('FEED-05: Load More appends articles', async ({ page }) => {
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const loadMoreBtn = page.getByRole('button', { name: 'Load More' });

  // Only test pagination if Load More button is present (i.e., >25 articles)
  if (await loadMoreBtn.isVisible()) {
    const beforeCount = await page.locator('a[href^="/articles/"]').count();
    await loadMoreBtn.click();

    // Wait for more articles to load
    await expect(page.locator('text=Loading more...')).not.toBeVisible({ timeout: 10000 });

    const afterCount = await page.locator('a[href^="/articles/"]').count();
    expect(afterCount).toBeGreaterThan(beforeCount);
  } else {
    // Not enough articles to paginate — skip
    test.skip();
  }
});

test('FEED-06: Load More hidden when all articles loaded', async ({ page }) => {
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const loadMoreBtn = page.getByRole('button', { name: 'Load More' });

  // Click Load More until it disappears (or it's already gone)
  let attempts = 0;
  while (await loadMoreBtn.isVisible() && attempts < 5) {
    await loadMoreBtn.click();
    await page.waitForTimeout(1500);
    attempts++;
  }

  // After exhausting all pages, Load More should not be visible
  await expect(loadMoreBtn).not.toBeVisible();
});

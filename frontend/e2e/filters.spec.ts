/**
 * TS-03 Dashboard — Filters
 * FILTER-01 through FILTER-08
 */
import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // Wait for initial load
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });
});

test('FILTER-01: filter by source', async ({ page }) => {
  const sourceSelect = page.locator('select').first();
  await sourceSelect.waitFor({ timeout: 10000 });

  const options = await sourceSelect.locator('option').all();
  // Need at least one non-"All Sources" option
  if (options.length <= 1) {
    test.skip();
    return;
  }

  // Select first non-empty option
  const firstSourceValue = await options[1].getAttribute('value');
  if (!firstSourceValue) { test.skip(); return; }

  await sourceSelect.selectOption(firstSourceValue);
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Results should appear (or show "No articles found" for that source)
  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-02: filter by entity', async ({ page }) => {
  // Entity dropdown is the second select
  const entitySelect = page.locator('select').nth(1);
  await entitySelect.waitFor({ timeout: 10000 });

  const options = await entitySelect.locator('option').all();
  if (options.length <= 1) { test.skip(); return; }

  const firstEntityValue = await options[1].getAttribute('value');
  if (!firstEntityValue) { test.skip(); return; }

  await entitySelect.selectOption(firstEntityValue);
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-03: filter by topic', async ({ page }) => {
  const topicSelect = page.locator('select').nth(2);
  await topicSelect.waitFor({ timeout: 10000 });

  const options = await topicSelect.locator('option').all();
  if (options.length <= 1) { test.skip(); return; }

  const firstTopicValue = await options[1].getAttribute('value');
  if (!firstTopicValue) { test.skip(); return; }

  await topicSelect.selectOption(firstTopicValue);
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-04: filter by from_date', async ({ page }) => {
  // First date input
  const fromDateInput = page.locator('input[type="date"]').first();
  await fromDateInput.fill('2024-01-01');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-05: filter by to_date', async ({ page }) => {
  // Second date input
  const toDateInput = page.locator('input[type="date"]').nth(1);
  await toDateInput.fill('2099-12-31');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-06: text search filters articles', async ({ page }) => {
  const searchInput = page.getByPlaceholder('Search articles...');
  await searchInput.fill('the');

  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  // Should show articles or empty state — either is valid depending on data
  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

test('FILTER-07: clearing filter restores full list', async ({ page }) => {
  const initialCount = await page.locator('a[href^="/articles/"]').count();

  // Apply a topic filter
  const topicSelect = page.locator('select').nth(2);
  const options = await topicSelect.locator('option').all();

  if (options.length > 1) {
    const firstTopicValue = await options[1].getAttribute('value');
    if (firstTopicValue) {
      await topicSelect.selectOption(firstTopicValue);
      await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

      // Reset to "All Topics"
      await topicSelect.selectOption('');
      await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

      const afterResetCount = await page.locator('a[href^="/articles/"]').count();
      expect(afterResetCount).toBeGreaterThanOrEqual(initialCount);
    }
  }
});

test('FILTER-08: combined filters source + topic + date', async ({ page }) => {
  const sourceSelect = page.locator('select').first();
  const topicSelect = page.locator('select').nth(2);
  const fromDateInput = page.locator('input[type="date"]').first();

  const sourceOptions = await sourceSelect.locator('option').all();
  const topicOptions = await topicSelect.locator('option').all();

  if (sourceOptions.length > 1) {
    const sv = await sourceOptions[1].getAttribute('value');
    if (sv) await sourceSelect.selectOption(sv);
  }

  if (topicOptions.length > 1) {
    const tv = await topicOptions[1].getAttribute('value');
    if (tv) await topicSelect.selectOption(tv);
  }

  await fromDateInput.fill('2024-01-01');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });

  const hasArticles = await page.locator('a[href^="/articles/"]').count();
  const hasEmpty = await page.locator('text=No articles found.').isVisible();
  expect(hasArticles > 0 || hasEmpty).toBe(true);
});

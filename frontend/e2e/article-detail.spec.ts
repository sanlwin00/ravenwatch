/**
 * TS-05 Article Detail
 * DETAIL-01 through DETAIL-07
 */
import { test, expect } from './fixtures';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Loading articles...')).not.toBeVisible({ timeout: 15000 });
});

test('DETAIL-01: clicking article card navigates to detail page', async ({ page }) => {
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });

  await firstCard.click();
  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
});

test('DETAIL-02: detail page shows metadata', async ({ page }) => {
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // Source name should be present in meta row
  const metaRow = page.locator('.text-slate-300, .text-slate-400').first();
  await expect(metaRow).toBeVisible({ timeout: 10000 });
});

test('DETAIL-03: detail page shows translated text if available', async ({ page }) => {
  // Navigate to first article
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // Either content block or "No translated content available"
  const contentBlock = page.locator('text=Content');
  const noContent = page.locator('text=No translated content available.');

  const hasContent = await contentBlock.isVisible();
  const hasNoContent = await noContent.isVisible();

  expect(hasContent || hasNoContent).toBe(true);
});

test('DETAIL-04: entity tags shown on article with entities', async ({ page }) => {
  // Get first article that has entities, or just check first article
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // If entities section exists, badges should be visible
  const entitiesSection = page.locator('h2', { hasText: 'Entities' });
  if (await entitiesSection.isVisible()) {
    // At least one entity badge visible
    const badges = page.locator('h2:has-text("Entities") + div [class*="badge"], h2:has-text("Entities") ~ div span');
    expect(await badges.count()).toBeGreaterThan(0);
  }
});

test('DETAIL-05: topic tags shown on article with topics', async ({ page }) => {
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // If topics section exists, badges should be visible
  const topicsSection = page.locator('h2', { hasText: 'Topics' });
  if (await topicsSection.isVisible()) {
    const badges = topicsSection.locator('~ div span');
    expect(await badges.count()).toBeGreaterThan(0);
  }
});

test('DETAIL-06: external link opens original URL in new tab', async ({ page, context }) => {
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // Check for "Original" link (external link to source)
  const externalLink = page.getByRole('link', { name: 'Original' });
  if (await externalLink.isVisible()) {
    // Verify it opens in a new tab
    const target = await externalLink.getAttribute('target');
    expect(target).toBe('_blank');

    const rel = await externalLink.getAttribute('rel');
    expect(rel).toContain('noopener');
  }
});

test('DETAIL-07: back navigation returns to dashboard', async ({ page }) => {
  const firstCard = page.locator('a[href^="/articles/"]').first();
  await expect(firstCard).toBeVisible({ timeout: 15000 });
  await firstCard.click();

  await expect(page).toHaveURL(/\/articles\/[a-f0-9-]+/, { timeout: 10000 });
  await expect(page.locator('text=Loading article...')).not.toBeVisible({ timeout: 15000 });

  // Click "Back to Dashboard" link
  const backLink = page.getByRole('link', { name: 'Back to Dashboard' });
  await expect(backLink).toBeVisible({ timeout: 5000 });
  await backLink.click();

  await expect(page).toHaveURL('/', { timeout: 10000 });
});

/**
 * TS-06 Entity Management
 * ENTITY-01 through ENTITY-08
 */
import { test, expect } from './fixtures';

const TEST_ENTITY_NAME = `E2E Test Entity ${Date.now()}`;

test.beforeEach(async ({ page }) => {
  await page.goto('/entities');
  await expect(page.locator('text=Loading entities...')).not.toBeVisible({ timeout: 15000 });
});

test('ENTITY-01: entity list loads with seeded entities', async ({ page }) => {
  // Table should be visible
  const table = page.locator('table');
  await expect(table).toBeVisible({ timeout: 10000 });

  const rows = page.locator('tbody tr');
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
});

test('ENTITY-02: Tier 1 entities present (Deng Xijun, Wang Yi, etc)', async ({ page }) => {
  const table = page.locator('table');
  await expect(table).toBeVisible({ timeout: 10000 });

  // Check for known Tier 1 entities — at least one should be present
  const allText = await page.locator('tbody').textContent();
  const knownEntities = ['Deng Xijun', 'Wang Yi', 'Min Aung Hlaing', 'Liu Zhongyi'];
  const found = knownEntities.filter(name => allText?.includes(name));

  expect(found.length).toBeGreaterThan(0);
});

test('ENTITY-03: tier badges are visible (T1 blue, T2 gray)', async ({ page }) => {
  const table = page.locator('table');
  await expect(table).toBeVisible({ timeout: 10000 });

  // T1 badge
  const t1Badges = page.locator('span', { hasText: 'T1' });
  const t1Count = await t1Badges.count();

  // T2 badge
  const t2Badges = page.locator('span', { hasText: 'T2' });
  const t2Count = await t2Badges.count();

  expect(t1Count + t2Count).toBeGreaterThan(0);
});

test('ENTITY-04: add new entity and verify it appears in list', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Entity' }).click();

  // Modal should open
  const modal = page.locator('h2:has-text("Add Entity")');
  await expect(modal).toBeVisible({ timeout: 5000 });

  // Fill form
  const nameInput = page.locator('label:has-text("Name *") + input');
  await nameInput.fill(TEST_ENTITY_NAME);

  const chineseNameInput = page.locator('label:has-text("Chinese Name") + input');
  await chineseNameInput.fill('测试');

  // Type is pre-filled with "person", tier with "1" — leave defaults

  // Save
  await page.getByRole('button', { name: 'Save' }).click();

  // Modal should close
  await expect(page.locator('h2:has-text("Add Entity")')).not.toBeVisible({ timeout: 10000 });

  // Entity should appear in table
  await expect(page.locator(`text=${TEST_ENTITY_NAME}`)).toBeVisible({ timeout: 15000 });
});

test('ENTITY-05: add entity with aliases', async ({ page }) => {
  const aliasEntityName = `E2E Alias Entity ${Date.now()}`;

  await page.getByRole('button', { name: 'Add Entity' }).click();
  await expect(page.locator('h2:has-text("Add Entity")')).toBeVisible({ timeout: 5000 });

  const nameInput = page.locator('label:has-text("Name *") + input');
  await nameInput.fill(aliasEntityName);

  // Aliases textarea
  const aliasesTextarea = page.locator('textarea');
  await aliasesTextarea.fill('Alias One\nAlias Two');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h2:has-text("Add Entity")')).not.toBeVisible({ timeout: 10000 });

  // Entity should appear
  await expect(page.locator(`text=${aliasEntityName}`)).toBeVisible({ timeout: 15000 });

  // Clean up — delete this entity
  const entityRow = page.locator('tr', { has: page.locator(`text=${aliasEntityName}`) });
  const deleteBtn = entityRow.locator('button').last();
  page.once('dialog', dialog => dialog.accept());
  await deleteBtn.click();
  await expect(page.locator(`text=${aliasEntityName}`)).not.toBeVisible({ timeout: 10000 });
});

test('ENTITY-06: edit existing entity name', async ({ page }) => {
  const table = page.locator('table');
  await expect(table).toBeVisible({ timeout: 10000 });

  // Find the test entity we created in ENTITY-04 (or any entity)
  // Look for TEST_ENTITY_NAME — if present (tests may run in order), edit it
  const testEntityRow = page.locator('tr', { has: page.locator(`text=${TEST_ENTITY_NAME}`) });
  const rowCount = await testEntityRow.count();

  let targetRow: ReturnType<typeof page.locator>;
  let originalName: string;

  if (rowCount > 0) {
    targetRow = testEntityRow.first();
    originalName = TEST_ENTITY_NAME;
  } else {
    // Edit first row in table
    targetRow = page.locator('tbody tr').first();
    originalName = (await targetRow.locator('td').first().textContent()) || '';
  }

  // Click edit button (pencil icon — first button in action column)
  const editBtn = targetRow.locator('button').first();
  await editBtn.click();

  await expect(page.locator('h2:has-text("Edit Entity")')).toBeVisible({ timeout: 5000 });

  // Modify name
  const nameInput = page.locator('label:has-text("Name *") + input');
  const updatedName = originalName + ' (edited)';
  await nameInput.clear();
  await nameInput.fill(updatedName);

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h2:has-text("Edit Entity")')).not.toBeVisible({ timeout: 10000 });

  // Updated name appears in table
  await expect(page.locator(`text=${updatedName}`)).toBeVisible({ timeout: 15000 });

  // Revert the change (clean up)
  const updatedRow = page.locator('tr', { has: page.locator(`text=${updatedName}`) }).first();
  const revertEditBtn = updatedRow.locator('button').first();
  await revertEditBtn.click();
  await expect(page.locator('h2:has-text("Edit Entity")')).toBeVisible({ timeout: 5000 });
  const nameInputRevert = page.locator('label:has-text("Name *") + input');
  await nameInputRevert.clear();
  await nameInputRevert.fill(originalName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h2:has-text("Edit Entity")')).not.toBeVisible({ timeout: 10000 });
});

test('ENTITY-07: delete entity removes it from list', async ({ page }) => {
  // Add a temporary entity to delete
  const tempEntityName = `E2E Delete Me ${Date.now()}`;

  await page.getByRole('button', { name: 'Add Entity' }).click();
  await expect(page.locator('h2:has-text("Add Entity")')).toBeVisible({ timeout: 5000 });

  const nameInput = page.locator('label:has-text("Name *") + input');
  await nameInput.fill(tempEntityName);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h2:has-text("Add Entity")')).not.toBeVisible({ timeout: 10000 });
  await expect(page.locator(`text=${tempEntityName}`)).toBeVisible({ timeout: 15000 });

  // Delete it
  const entityRow = page.locator('tr', { has: page.locator(`text=${tempEntityName}`) }).first();
  const deleteBtn = entityRow.locator('button').last();

  // Accept the confirm dialog
  page.once('dialog', dialog => dialog.accept());
  await deleteBtn.click();

  await expect(page.locator(`text=${tempEntityName}`)).not.toBeVisible({ timeout: 10000 });
});

test('ENTITY-08: add entity with empty name shows validation error', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Entity' }).click();
  await expect(page.locator('h2:has-text("Add Entity")')).toBeVisible({ timeout: 5000 });

  // Leave name empty, try to submit
  await page.getByRole('button', { name: 'Save' }).click();

  // HTML5 required field validation should prevent submission
  const nameInput = page.locator('label:has-text("Name *") + input');
  const isValid = await nameInput.evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(isValid).toBe(false);

  // Modal should still be open
  await expect(page.locator('h2:has-text("Add Entity")')).toBeVisible();
});

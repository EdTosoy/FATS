import { expect, type Page } from '@playwright/test';
export const originalLetter =
  'Dear team,\nMy original cover letter.\n<script>window.preparationExecuted=true</script>';
export async function savePreparationJob(page: Page) {
  await page.goto('/applications');
  await page
    .getByRole('button', { name: 'Save your first job', exact: true })
    .or(
      page
        .getByRole('banner')
        .getByRole('button', { name: 'Save a job', exact: true }),
    )
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Job title/).fill('Preparation Engineer');
  await dialog.getByLabel(/^Company/).fill('Synthetic Preparation Co');
  await dialog.getByLabel(/^Location/).fill('Cebu');
  await dialog
    .getByLabel(/^Source URL/)
    .fill('https://example.test/preparation');
  await dialog.getByRole('button', { name: 'Save job', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preparation Engineer', exact: true }),
  ).toBeVisible();
}
export function preparationSection(page: Page) {
  return page.getByRole('region', { name: 'Preparation', exact: true });
}
export function material(page: Page, title: string) {
  return preparationSection(page)
    .locator('.preparation-list > li')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}
export async function addMaterial(
  page: Page,
  title = 'Targeted cover letter',
  text = originalLetter,
  kind = 'cover-letter',
  ready = true,
) {
  await preparationSection(page)
    .getByRole('button', { name: 'New material', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Material type', exact: true })
    .selectOption(kind);
  await dialog
    .getByLabel('Title / screening question', { exact: true })
    .fill(title);
  await dialog
    .getByLabel(kind === 'screening-answer' ? 'Answer text' : 'Material text', {
      exact: true,
    })
    .fill(text);
  if (kind === 'portfolio')
    await dialog
      .getByLabel('Portfolio URL', { exact: true })
      .fill('https://example.test/project');
  if (ready)
    await dialog
      .getByRole('combobox', { name: 'Material readiness', exact: true })
      .selectOption('ready');
  await expect(dialog.getByRole('status')).toContainText('Unsaved changes');
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
}
export async function completePreparationJourney(page: Page) {
  await savePreparationJob(page);
  await addMaterial(page);
  const section = preparationSection(page),
    cover = material(page, 'Targeted cover letter');
  await expect(cover.getByText('Ready', { exact: true })).toBeVisible();
  await cover
    .getByRole('button', { name: 'Record submitted copy', exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Confirm submitted copy', exact: true })
    .click();
  await expect(cover.getByText('Submitted', { exact: true })).toBeVisible();
  await page.reload();
  await expect(cover.getByText('Submitted', { exact: true })).toBeVisible();
  await cover
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Material text', { exact: true })).toHaveValue(
    originalLetter,
  );
  await dialog
    .getByLabel('Material text', { exact: true })
    .fill('My revised cover letter.');
  await dialog
    .getByRole('button', { name: 'Save material', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(cover.getByText('Draft', { exact: true })).toBeVisible();
  await cover.locator('.preparation-submitted summary').click();
  await expect(cover.locator('.preparation-submitted')).toContainText(
    'My original cover letter.',
  );
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { preparationExecuted?: boolean })
          .preparationExecuted,
    ),
  ).toBeUndefined();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await cover.getByRole('button', { name: 'Copy text', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'My revised cover letter.',
  );
  await addMaterial(
    page,
    'Why this company?',
    'My first screening answer.',
    'screening-answer',
  );
  await addMaterial(
    page,
    'When can you start?',
    'After graduation.',
    'screening-answer',
  );
  await addMaterial(
    page,
    'Video introduction',
    'Hello, I am a graduate engineer.',
    'introduction',
  );
  await addMaterial(
    page,
    'Portfolio capstone',
    'A project relevant to this role.',
    'portfolio',
  );
  await addMaterial(
    page,
    'Resume selection',
    'Use resume-graduate-v2.pdf for this role.',
    'resume-notes',
  );
  await section
    .getByRole('button', { name: 'Edit preparation notes', exact: true })
    .click();
  await dialog
    .getByLabel('General preparation notes', { exact: true })
    .fill('Review company values before applying.');
  await dialog
    .getByRole('button', { name: 'Save preparation notes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(
    section.getByText('Review company values before applying.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(section.locator('.preparation-list > li')).toHaveCount(6);
  await material(page, 'Video introduction')
    .getByRole('button', { name: 'Delete material', exact: true })
    .click();
  await section
    .getByRole('button', { name: 'Confirm delete material', exact: true })
    .click();
  await expect(material(page, 'Video introduction')).toHaveCount(0);
  await material(page, 'Resume selection')
    .getByRole('button', { name: 'Edit material', exact: true })
    .click();
  await dialog
    .getByLabel('Material text', { exact: true })
    .fill('Unsaved replacement');
  page.once('dialog', (dialog) => dialog.dismiss());
  await dialog
    .getByRole('button', { name: 'Cancel editing', exact: true })
    .click();
  await expect(dialog).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await dialog
    .getByRole('button', { name: 'Cancel editing', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    material(page, 'Resume selection').getByText(
      'Use resume-graduate-v2.pdf for this role.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Application status', exact: true }),
  ).toHaveValue('Saved');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

import { expect, type Page } from '@playwright/test';
import { localDateTime } from '@fats/domain';
import { savePreparationJob, addMaterial, material } from './preparation';
export async function addTask(
  page: Page,
  title = 'Recruiter follow-up',
  dueDate = '2000-01-01',
) {
  await page
    .getByRole('region', { name: 'Application tasks', exact: true })
    .getByRole('button', { name: 'New task', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task title', { exact: true }).fill(title);
  await dialog
    .getByLabel('Task notes', { exact: true })
    .fill('Keep these follow-up notes');
  await dialog.getByLabel('Due date', { exact: true }).fill(dueDate);
  return dialog;
}
export async function taskJourney(page: Page) {
  await savePreparationJob(page);
  await addMaterial(page);
  const url = page.url();
  let dialog = await addTask(page);
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await addTask(
    page,
    'Assessment',
    localDateTime(new Date().toISOString(), 'Asia/Manila').date,
  );
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  dialog = await addTask(page, 'Future action', '2099-01-01');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.goto('/');
  const next = page.getByRole('region', { name: 'Next actions', exact: true });
  for (const group of ['Overdue', 'Due today', 'Upcoming'])
    await expect(
      next.getByRole('region', { name: `${group} next actions`, exact: true }),
    ).toBeVisible();
  await next
    .getByRole('region', { name: 'Overdue next actions', exact: true })
    .getByRole('button', { name: 'Complete task', exact: true })
    .click();
  await expect(
    next.getByRole('region', { name: 'Overdue next actions', exact: true }),
  ).toHaveCount(0);
  await page.goto(url);
  const tasks = page.getByRole('region', {
    name: 'Application tasks',
    exact: true,
  });
  await expect(
    tasks.getByRole('region', { name: 'Completed tasks', exact: true }),
  ).toContainText('Recruiter follow-up');
  await tasks
    .getByRole('region', { name: 'Completed tasks', exact: true })
    .getByRole('button', { name: 'Reopen task', exact: true })
    .click();
  await tasks
    .getByRole('region', { name: 'Overdue tasks', exact: true })
    .getByRole('button', { name: 'Edit task', exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Task title', { exact: true })
    .fill('Revised follow-up');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(tasks).toContainText('Revised follow-up');
  await expect(material(page, 'Targeted cover letter')).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'Application status', exact: true }),
  ).toHaveValue('Saved');
  await tasks
    .getByRole('region', { name: 'Overdue tasks', exact: true })
    .getByRole('button', { name: 'Delete task', exact: true })
    .click();
  await tasks
    .getByRole('button', { name: 'Confirm delete task', exact: true })
    .click();
  await expect(tasks).not.toContainText('Revised follow-up');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

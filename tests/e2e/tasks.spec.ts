import { test, expect } from '@playwright/test';
import { taskJourney, addTask } from '../helpers/task';
import { savePreparationJob } from '../helpers/preparation';
test('tasks persist, appear in dashboard groups, complete, reopen, edit and delete', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await taskJourney(page);
  await page.screenshot({ path: info.outputPath('tasks.png'), fullPage: true });
  await page.goto('/');
  await page.screenshot({
    path: info.outputPath('next-actions.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('task save failure retains inputs and supports an atomic retry', async ({
  page,
}) => {
  await savePreparationJob(page);
  const before = await page.evaluate(() =>
    localStorage.getItem('fats.applications.v1'),
  );
  const dialog = await addTask(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as unknown as { restoreTask: () => void }).restoreTask = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'fats.applications.v1')
        throw new DOMException('Synthetic quota', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('could not be saved');
  await expect(dialog.getByLabel('Task title', { exact: true })).toHaveValue(
    'Recruiter follow-up',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
  ).toBe(before);
  await page.evaluate(() =>
    (window as unknown as { restoreTask: () => void }).restoreTask(),
  );
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('timed tasks require a choice for repeated clock times', async ({
  page,
}) => {
  await savePreparationJob(page);
  const dialog = await addTask(page, 'Timed follow-up', '2026-11-01');
  await dialog.getByLabel('Due time (optional)', { exact: true }).fill('01:30');
  await dialog.getByLabel(/^Task timezone/).fill('America/New_York');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('occurs twice');
  await dialog
    .getByRole('combobox', { name: 'Repeated clock time', exact: true })
    .selectOption('later');
  await dialog.getByRole('button', { name: 'Save task', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('fats.applications.v1')!)
          .applications[0].tasks[0].dueAt,
    ),
  ).toBe('2026-11-01T06:30:00.000Z');
});

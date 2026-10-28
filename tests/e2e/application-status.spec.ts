import { expect, test as base } from '@playwright/test';
import { APPLICATION_STATUSES } from '@fats/domain';
import { writeFile } from 'node:fs/promises';

const test = base.extend({
  page: async ({ page }, run) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await run(page);
    expect(errors, 'Unexpected browser runtime errors').toEqual([]);
  },
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`${colorScheme}: status beside the posting, keyboard updates, persistence and write recovery`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/applications');
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Save a job', exact: true })
      .click();
    const form = page.getByRole('dialog');
    await form.getByLabel(/^Job title/).fill('Graduate Developer');
    await form.getByLabel(/^Company/).fill('Example Company');
    await form.getByLabel(/^Location/).fill('Makati');
    await form.getByLabel(/^Source URL/).fill('https://example.test/job');
    await form.getByRole('button', { name: 'Save job', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Graduate Developer', exact: true }),
    ).toBeVisible();
    await page.reload();
    const control = page.getByRole('combobox', {
      name: 'Application status',
      exact: true,
    });
    const posting = page.getByRole('link', {
      name: 'Open job website',
      exact: true,
    });
    const tracking = page.locator('.application-status');
    await expect(control).toHaveCount(1);
    await expect(control).toHaveValue('Saved');
    await expect(
      page.locator('.detail-overview').getByRole('combobox'),
    ).toHaveCount(1);
    await page.evaluate(() => scrollTo(0, 0));
    const box = (await control.boundingBox())!;
    const source = (await posting.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(box.y - (source.y + source.height)).toBeLessThan(64);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(source.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await info.attach('status-position', {
      body: JSON.stringify({
        viewport: page.viewportSize(),
        status: box,
        source,
      }),
      contentType: 'application/json',
    });
    await page.screenshot({
      path: info.outputPath(`saved-${colorScheme}.png`),
      fullPage: true,
    });
    await writeFile(
      info.outputPath(`position-${colorScheme}.json`),
      JSON.stringify(
        { viewport: page.viewportSize(), status: box, source },
        null,
        2,
      ),
    );

    await posting.focus();
    await page.keyboard.press('Tab');
    await expect(control).toBeFocused();
    expect(
      await control.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe('none');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(control).toHaveValue('Applied');
    await expect(tracking.getByRole('status')).toHaveText(
      'Status updated to Applied.',
    );
    await expect(control).toBeFocused();
    const feedbackBox = (await tracking.getByRole('status').boundingBox())!;
    expect(feedbackBox.y + feedbackBox.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await page.reload();
    await expect(control).toHaveValue('Applied');
    await page.screenshot({
      path: info.outputPath(`applied-${colorScheme}.png`),
      fullPage: true,
    });

    for (const status of APPLICATION_STATUSES) {
      await control.selectOption(status);
      await expect(control).toBeEnabled();
      await expect(tracking.getByRole('status')).toHaveText(
        `Status updated to ${status}.`,
      );
      await expect(page.locator('.detail-company .status')).toHaveText(status);
      await page.reload();
      await expect(control).toHaveValue(status);
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('fats.applications.v1')!)
              .applications[0].status,
        ),
      ).toBe(status);
      if (status === 'Interview')
        await expect(
          page.getByText('No interviews linked yet.', { exact: true }),
        ).toBeVisible();
    }

    const previous = await control.inputValue();
    const target = previous === 'Applied' ? 'Saved' : 'Applied';
    const before = await page.evaluate(() =>
      localStorage.getItem('fats.applications.v1'),
    );
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'fats.applications.v1')
          throw new DOMException(
            'Synthetic storage full',
            'QuotaExceededError',
          );
        original.call(this, key, value);
      };
      (
        window as Window & { restoreStatusWrites?: () => void }
      ).restoreStatusWrites = () => {
        Storage.prototype.setItem = original;
      };
    });
    await control.selectOption(target);
    await expect(tracking.getByRole('alert')).toContainText(
      'could not be saved',
    );
    await expect(control).toHaveValue(previous);
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(tracking.getByRole('status')).toHaveText(
      `Status is still ${previous}.`,
    );
    expect(
      await page.evaluate(() => localStorage.getItem('fats.applications.v1')),
    ).toBe(before);
    await page.screenshot({
      path: info.outputPath(`failed-${colorScheme}.png`),
      fullPage: true,
    });
    await page.evaluate(() =>
      (window as Window & { restoreStatusWrites?: () => void })
        .restoreStatusWrites!(),
    );
    await control.selectOption(target);
    await expect(tracking.getByRole('status')).toHaveText(
      `Status updated to ${target}.`,
    );
    await expect(tracking.getByRole('alert')).toHaveCount(0);
    await expect(control).not.toHaveAttribute('aria-invalid', 'true');
    await page.reload();
    await expect(control).toHaveValue(target);
    await expect(posting).toHaveAttribute('href', 'https://example.test/job');
    await expect(
      page.getByRole('heading', { name: 'Application record', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Edit details', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Schedule interview', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Edit details', exact: true })
      .click();
    await form
      .getByLabel(/^Job description/)
      .fill('Synthetic requirements and responsibilities.\n'.repeat(60));
    await form
      .getByLabel(/^Source URL/)
      .fill('https://example.test/job?notes=' + 'synthetic'.repeat(60));
    await form
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(form).not.toBeVisible();
    await page.reload();
    await expect(control).toHaveValue(target);
    await page.evaluate(() => scrollTo(0, 0));
    const updatedBox = (await control.boundingBox())!;
    expect(updatedBox.y + updatedBox.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

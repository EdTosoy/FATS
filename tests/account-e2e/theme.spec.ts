import { expect, test, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { browserTestOrigin as origin } from '../helpers/browser-origin';
import { testEmail } from '../helpers/test-inbox';
import { careerFixture } from '../helpers/career-fixture';
import { pdfFixture } from '../helpers/document-fixtures';
import { syntheticScanner } from '../helpers/document-scanner';
import { createDatabasePool } from '../../apps/web/src/server/services';
import { PostgresWorkspaceRepository } from '../../apps/web/src/server/workspace-repository';
import { PostgresDocumentRepository } from '../../apps/web/src/server/document-repository';
import { FilesystemDocumentStorage } from '../../apps/web/src/server/document-storage';
import { beginAccountErasure } from '../../apps/web/src/server/account-lifecycle';
import { recoverAccountErasure } from '../../apps/web/src/server/account-erasure';
import { APPLICATION_STATUSES, serializeBackup } from '@fats/domain';

const pool = createDatabasePool(process.env.FATS_TEST_DATABASE_URL!);
const storage = new FilesystemDocumentStorage(
  new URL('../../test-results/account-documents/', import.meta.url).pathname,
);
const owners: string[] = [];
const password = 'Synthetic-theme-passphrase-42!';
test.afterAll(async () => {
  for (const owner of owners) {
    const receipt = randomBytes(32).toString('hex');
    await beginAccountErasure(pool, owner, receipt);
    expect(await recoverAccountErasure(pool, receipt, storage)).toBe(
      'complete',
    );
  }
  await pool.end();
});
async function register(page: Page) {
  const email = `theme-browser-${randomUUID()}@example.test`;
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers: { origin },
        data: { email, password, name: 'Synthetic Theme Graduate' },
      })
    ).ok(),
  ).toBe(true);
  const message = await testEmail(email, 'Verify your FATS email');
  expect(
    (
      await page.request.post('/api/auth/verify-email', {
        headers: { origin },
        data: { email, code: message.match(/code is (\d{8})/)![1] },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', {
        headers: { origin },
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  const { user } = await (await page.request.get('/api/account')).json();
  owners.push(user.id);
  return user.id as string;
}
async function dialogHasFocus(page: Page) {
  await expect
    .poll(() =>
      page
        .getByRole('dialog')
        .last()
        .evaluate((el) => el.contains(document.activeElement)),
    )
    .toBe(true);
}
async function close(page: Page, name: string) {
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name, exact: true })
    .click();
}

test('account empty/populated routes, documents, offers, Career Vault, and security overlays share both themes', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const owner = await register(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Save your first job', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('dark-fresh-account.png'),
    fullPage: true,
  });
  const workspace = new PostgresWorkspaceRepository(pool, owner);
  const fixture = careerFixture();
  const stage = await workspace.previewRestore(serializeBackup(fixture));
  await workspace.restoreBackup(stage.token);
  const applications = [];
  for (const status of APPLICATION_STATUSES) {
    const input = {
      title: `Synthetic ${status} opportunity`,
      company: 'Example Studio',
      location: 'Manila',
      sourceUrl: `https://example.test/${status}`,
      description: 'Synthetic role description for visual verification.',
    };
    const application = await workspace.create(input);
    applications.push(
      await workspace.update(application.id, { ...input, status }),
    );
  }
  const interview = await workspace.createInterview({
    applicationId: applications[0]!.id,
    title: 'Synthetic project conversation',
    stage: 'Technical',
    scheduledAt: new Date(Date.now() + 3 * 86400000).toISOString(),
    timeZone: 'Asia/Manila',
    meetingUrl: 'https://example.test/meeting',
    location: '',
    preparationNotes: 'Explain the capstone project and prepare questions.',
    reflections: '',
  });
  // Labelled fixtures use the dedicated test DB/private directory. This scanner
  // is test-only; application upload quarantine and real scanner checks stay intact.
  const documents = new PostgresDocumentRepository(
    pool,
    owner,
    storage,
    syntheticScanner,
  );
  await documents.upload(
    await pdfFixture('SYNTHETIC RESUME - theme verification only'),
    'synthetic-resume.pdf',
    {
      requestId: randomUUID(),
      name: 'Synthetic Graduate Resume',
      category: 'Resumes',
    },
  );
  const viewports =
    info.project.name === 'desktop'
      ? [
          { width: 1916, height: 952 },
          { width: 1366, height: 768 },
          { width: 820, height: 1180 },
        ]
      : [{ width: 390, height: 844 }];
  for (const scheme of ['light', 'dark'] as const) {
    await page.goto('/settings');
    await page
      .getByRole('radio', {
        name: scheme === 'light' ? 'Light' : 'Dark',
        exact: true,
      })
      .check();
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(
        page.getByRole('region', { name: 'Your next step', exact: true }),
      ).toContainText('A conversation worth preparing for.');
      await page.screenshot({
        path: info.outputPath(`${scheme}-dashboard-${viewport.width}.png`),
        fullPage: true,
      });
    }
    for (const path of [
      '/applications',
      `/applications/${applications[0]!.id}`,
      `/applications/${fixture.data.applications[0]!.id}#offer-desk`,
      '/interviews',
      `/interviews/${interview.id}`,
      '/resumes',
      '/career-vault',
      '/settings',
      '/help',
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        path,
      ).toBe(true);
      const label = path.includes('#offer')
        ? 'offer-desk'
        : path.startsWith('/applications/')
          ? 'application-detail'
          : path.startsWith('/interviews/')
            ? 'interview-detail'
            : path.slice(1);
      await page.screenshot({
        path: info.outputPath(`${scheme}-${label}.png`),
        fullPage: true,
      });
    }
    await page.goto('/settings');
    await page
      .getByRole('button', { name: 'Delete account…', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveAccessibleName(
      'Permanently delete your account?',
    );
    await expect(
      page.getByRole('button', {
        name: 'Permanently delete account',
        exact: true,
      }),
    ).toBeDisabled();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-account-delete-dialog.png`),
      fullPage: true,
    });
    await close(page, 'Close');
    await page.getByLabel('Choose JSON backup').setInputFiles({
      name: 'synthetic-theme.json',
      mimeType: 'application/json',
      buffer: Buffer.from(serializeBackup(fixture)),
    });
    await page
      .getByRole('button', { name: 'Preview backup', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-backup-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.goto('/career-vault');
    await page
      .getByRole('button', {
        name: 'Graduate Assistant at Synthetic Career Employer',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Edit employment', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-career-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.goto(
      `/applications/${fixture.data.applications[0]!.id}#offer-desk`,
    );
    await page
      .getByRole('button', {
        name: 'Review checklist and HR questions',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-offer-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.goto('/interviews');
    await page
      .getByRole('button', { name: 'Add interview', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-interview-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page.goto('/resumes');
    await page
      .getByRole('button', { name: 'Upload document', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await dialogHasFocus(page);
    await page.screenshot({
      path: info.outputPath(`${scheme}-upload-dialog.png`),
      fullPage: true,
    });
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', {
        name: 'Open document Synthetic Graduate Resume',
        exact: true,
      })
      .click();
    await page.screenshot({
      path: info.outputPath(`${scheme}-document-dialog.png`),
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Preview PDF', exact: true })
      .click();
    const preview = page.getByRole('dialog', {
      name: 'PDF preview',
      exact: true,
    });
    await expect(
      preview.getByRole('img', { name: 'PDF page 1', exact: true }),
    ).toHaveAttribute('data-rendered', 'true', { timeout: 30000 });
    expect(
      await preview
        .locator('canvas')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe('rgb(255, 255, 255)');
    await page.screenshot({
      path: info.outputPath(`${scheme}-pdf-preview.png`),
      fullPage: true,
    });
    await close(page, 'Close preview');
    await close(page, 'Close document');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
  }
  expect(errors).toEqual([]);
});

test('authentication, verification, recovery, and session gates keep the shared theme', async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('dark-login.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create an account', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({
    path: info.outputPath('light-registration.png'),
    fullPage: true,
  });
  await page
    .getByRole('combobox', { name: 'Appearance', exact: true })
    .selectOption('dark');
  await page.screenshot({
    path: info.outputPath('dark-registration.png'),
    fullPage: true,
  });
  const email = `theme-auth-${randomUUID()}@example.test`;
  await page
    .getByLabel('Your name', { exact: true })
    .fill('Synthetic Theme Graduate');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Verify your email', exact: true }),
  ).toBeVisible();
  const owner = (
    await pool.query('SELECT id FROM "user" WHERE email=$1', [email])
  ).rows[0].id as string;
  owners.push(owner);
  await page.screenshot({
    path: info.outputPath('dark-verification.png'),
    fullPage: true,
  });
  const message = await testEmail(email, 'Verify your FATS email');
  await page
    .getByLabel('Verification code', { exact: true })
    .fill(message.match(/code is (\d{8})/)![1]);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Email verified.', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('dark-verified.png'),
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'Sign in to continue', exact: true })
    .click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Workspace settings', exact: true }),
  ).toBeVisible();
  await pool.query(
    'UPDATE session SET "expiresAt"=now()-interval \'1 second\' WHERE "userId"=$1',
    [owner],
  );
  await page.reload();
  await expect(
    page.getByRole('heading', {
      name: 'Let’s reconnect your account.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: info.outputPath('dark-session-gate.png'),
    fullPage: true,
  });
  for (const path of ['/forgot-password', '/reset-password']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`dark-${path.slice(1)}.png`),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

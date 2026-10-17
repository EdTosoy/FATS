// Keep local verification separate from a developer's running workspace.
export const browserTestPort = Number(process.env.FATS_TEST_PORT ?? 3000);
if (
  !Number.isInteger(browserTestPort) ||
  browserTestPort < 1024 ||
  browserTestPort > 65535
)
  throw new Error(
    'FATS_TEST_PORT must be a local test port between 1024 and 65535.',
  );
export const browserTestOrigin = `http://127.0.0.1:${browserTestPort}`;

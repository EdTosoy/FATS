# Local account configuration

Use `pnpm db:configure` to generate private random credentials in ignored `apps/web/.env.local`. The helper refuses to overwrite an existing file. Run `pnpm db:up`, `pnpm db:migrate`, then `pnpm dev`.

For an independently managed local PostgreSQL installation, create a private `apps/web/.env.local` file using these documented variables. Replace the example values with unique random credentials; never deploy the examples or commit real secrets. Keep file permissions restricted to the current user.

```dotenv
# Local development only. Copy to .env.local; that file is ignored by Git.
# Generate unique values; do not deploy this example or commit real secrets.
POSTGRES_PASSWORD=replace-with-a-generated-local-database-password
POSTGRES_PORT=5433
DATABASE_URL=postgresql://fats:replace-with-a-generated-local-database-password@127.0.0.1:5433/fats
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
# Mailpit only; loopback SMTP delivery. No paid email credentials.
FATS_MAIL_PORT=1025
# Phase 5: absolute, persistent, canonical private directory (0700).
FATS_DOCUMENTS_DIR=/absolute/private/path/fats-documents
```

`BETTER_AUTH_URL` must match the exact local hostname/port you open. Mail is delivered only to loopback Mailpit: SMTP 1025 and inbox <http://127.0.0.1:8025>. Test services use separate ports and synthetic accounts; see [setup](../README.md#accounts-and-local-postgresql--phase-41). Hosted email delivery is outside this local slice.

Phase 5 files require persistent local storage separate from PostgreSQL. Existing configurations need this variable added manually and a server restart; `db:configure` never overwrites them. Keep bytes outside public/static hosting roots; see [document setup](DOCUMENTS.md). Restore uses an independently configured `FATS_RESTORE_DOCUMENTS_DIR` and never replaces an existing directory.

## Optional Phase 6 comparison

After migration `0005_matching.sql`, add `FATS_AI_PROVIDER=openai` and a private server-only `OPENAI_API_KEY` to the ignored web environment file and restart FATS. No provider is enabled by default; a missing key never produces a simulated result. Optional limits are `FATS_AI_DAILY_ACCOUNT_LIMIT=5` (1–50), `FATS_AI_DAILY_GLOBAL_LIMIT=20` (1–500), and `FATS_AI_TIMEOUT_MS=30000` (1–60,000 ms). Never prefix a provider secret with `NEXT_PUBLIC_`. No live-provider check runs as part of setup or automated tests.

The adapter pins `gpt-5.4-mini-2026-03-17`; changing its model/prompt/schema/extraction rules requires a deliberate analysis configuration revision and evaluation. Users review locally extracted text and separately consent to external transmission on every new comparison. Review [provider privacy, retention, usage costs, and extraction limits](MATCHING.md) before enabling it. Do not enable test fixtures in normal development/user databases. No hosted/cloud configuration is provisioned.

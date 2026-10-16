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

## Private beta: matching stays paused

Keep `FATS_AI_MATCHING_ENABLED=0` (or unset) and leave provider/key settings unset. The server reads this flag for both application details and `/api/matching`; disabled requests return `403 MATCHING_DISABLED` before account services, extraction, storage or provider access. Provider credentials alone cannot enable matching. Restart after configuration changes and reload open tabs. The client cannot enable the server flag. See [beta readiness](PRIVATE_BETA_READINESS.md).

The existing Phase 6 implementation and historical reports are preserved. Its UI, report retrieval/deletion and comparison actions are all inaccessible while paused; no retention sweep runs through that endpoint. Existing report protection on document/application deletion remains. Operator recovery still preserves reports without rerunning analysis. Do not enable matching or run evaluations during beta preparation.

## Historical Phase 6 configuration (requires separate authorization)

Only after AI work is explicitly resumed: migration `0005_matching.sql`, the separate server opt-in `FATS_AI_MATCHING_ENABLED=1`, `FATS_AI_PROVIDER=openai`, and a private server-only `OPENAI_API_KEY` are required. No provider is enabled by default; a missing key never produces a simulated result. Optional limits are `FATS_AI_DAILY_ACCOUNT_LIMIT=5` (1–50), `FATS_AI_DAILY_GLOBAL_LIMIT=20` (1–500), and `FATS_AI_TIMEOUT_MS=30000` (1–60,000 ms). Never prefix a provider secret with `NEXT_PUBLIC_`. No live-provider check runs as part of setup or automated tests.

The adapter pins `gpt-5.4-mini-2026-03-17`; changing its model/prompt/schema/extraction rules requires a deliberate analysis configuration revision and evaluation. Users review locally extracted text and separately consent to external transmission on every new comparison. Review [provider privacy, retention, usage costs, and extraction limits](MATCHING.md) before enabling it. Do not enable test fixtures in normal development/user databases. No hosted/cloud configuration is provisioned.

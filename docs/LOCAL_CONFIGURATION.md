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
```

`BETTER_AUTH_URL` must match the exact local hostname/port you open. Mail is delivered only to loopback Mailpit: SMTP 1025 and inbox <http://127.0.0.1:8025>. Test services use separate ports and synthetic accounts; see [setup](../README.md#accounts-and-local-postgresql--phase-41). Hosted email delivery is outside this local slice.

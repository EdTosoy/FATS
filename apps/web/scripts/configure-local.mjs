import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password = randomBytes(24).toString('hex');
await writeFile(
  new URL('../.env.local', import.meta.url),
  `POSTGRES_PASSWORD=${password}\nPOSTGRES_PORT=5433\nDATABASE_URL=postgresql://fats:${password}@127.0.0.1:5433/fats\nBETTER_AUTH_URL=http://localhost:3000\nBETTER_AUTH_SECRET=${randomBytes(48).toString('hex')}\nFATS_DOCUMENTS_DIR=${fileURLToPath(new URL('../.fats-private/documents', import.meta.url))}\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Created private apps/web/.env.local for local development. Existing configuration is never overwritten.',
);

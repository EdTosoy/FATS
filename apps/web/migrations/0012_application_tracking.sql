-- Optional structured details and owner-scoped timeline remain part of each record.
ALTER TABLE applications
  ADD COLUMN tracking jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tracking) = 'object'),
  ADD COLUMN activities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(activities) = 'array');

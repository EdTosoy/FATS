ALTER TABLE applications ADD COLUMN tasks jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(tasks) = 'array' AND jsonb_array_length(tasks) <= 100);

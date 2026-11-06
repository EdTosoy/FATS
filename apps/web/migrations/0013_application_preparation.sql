-- Preparation drafts belong to the same owner and lifecycle as their application.
ALTER TABLE applications ADD COLUMN preparations jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(preparations) = 'array' AND jsonb_array_length(preparations) <= 100);

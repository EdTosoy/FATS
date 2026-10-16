-- Provenance only: this UUID never authorizes a download or creates a file link.
ALTER TABLE offer_events ADD COLUMN source_version_id uuid;
ALTER TABLE offer_events ADD CONSTRAINT offer_source_reference CHECK (
  source_version_id IS NULL OR (kind='terms' AND version_id IS NULL)
);

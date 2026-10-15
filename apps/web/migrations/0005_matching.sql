ALTER TABLE applications ADD COLUMN description_revision bigint NOT NULL DEFAULT 1 CHECK(description_revision>0);
CREATE FUNCTION fats_description_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.description_revision=OLD.description_revision + CASE WHEN NEW.description IS DISTINCT FROM OLD.description THEN 1 ELSE 0 END; RETURN NEW; END;
$$;
CREATE TRIGGER applications_description_revision BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION fats_description_revision();
CREATE TABLE matching_previews (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  application_id text NOT NULL,
  version_id uuid NOT NULL,
  job_revision bigint NOT NULL,
  job_hash text NOT NULL,
  configuration jsonb NOT NULL,
  sources jsonb NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
  PRIMARY KEY(user_id,id),
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,version_id) REFERENCES document_versions(user_id,id) ON DELETE CASCADE
);
CREATE TABLE matching_reports (
  user_id uuid NOT NULL,
  id uuid NOT NULL,
  preview_id uuid NOT NULL,
  application_id text NOT NULL,
  version_id uuid NOT NULL,
  job_revision bigint NOT NULL,
  job_hash text NOT NULL,
  configuration jsonb NOT NULL,
  sources jsonb,
  result jsonb,
  status text NOT NULL CHECK(status IN ('running','complete','failed')),
  failure text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id),
  UNIQUE(user_id,preview_id),
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id,version_id) REFERENCES document_versions(user_id,id) ON DELETE RESTRICT,
  CHECK((status='complete' AND result IS NOT NULL AND sources IS NOT NULL) OR (status<>'complete' AND result IS NULL))
);
CREATE INDEX matching_reports_parent ON matching_reports(user_id,application_id,created_at DESC);
CREATE INDEX matching_reports_version ON matching_reports(user_id,version_id);
CREATE TABLE matching_usage (
  day date NOT NULL,
  scope text NOT NULL,
  attempts integer NOT NULL CHECK(attempts>0),
  PRIMARY KEY(day,scope)
);

-- Personal metadata only. No byte store or alternative upload/acceptance path.
CREATE TABLE career_employments (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  version integer NOT NULL CHECK(version BETWEEN 1 AND 100),
  details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
  application_id text,
  offer_application_id text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,id),
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id,offer_application_id) REFERENCES offers(user_id,application_id) ON DELETE RESTRICT,
  CHECK(details->>'applicationId'=COALESCE(application_id,'')),
  CHECK((details->>'fromAcceptedOffer')::boolean=(offer_application_id IS NOT NULL)),
  CHECK(offer_application_id IS NULL OR offer_application_id=application_id)
);
CREATE UNIQUE INDEX career_source_application ON career_employments(user_id,application_id) WHERE application_id IS NOT NULL;
CREATE TABLE career_events (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  employment_id uuid NOT NULL,
  sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('employment','document')),
  document_id uuid,
  details jsonb NOT NULL CHECK(jsonb_typeof(details)='object'),
  recorded_at timestamptz NOT NULL,
  version_id uuid,
  source_version_id uuid,
  application_id text,
  offer_application_id text,
  PRIMARY KEY(user_id,employment_id,sequence),
  UNIQUE(user_id,request_id),
  FOREIGN KEY(user_id,employment_id) REFERENCES career_employments(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,version_id) REFERENCES document_versions(user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id,offer_application_id) REFERENCES offers(user_id,application_id) ON DELETE RESTRICT,
  CHECK((kind='document')=(document_id IS NOT NULL)),
  CHECK(kind='document' OR (version_id IS NULL AND source_version_id IS NULL)),
  CHECK(source_version_id IS NULL OR version_id IS NULL),
  CHECK(kind<>'document' OR details->>'documentVersionId'=COALESCE(version_id::text,'')),
  CHECK(kind<>'employment' OR details->>'applicationId'=COALESCE(application_id,'')),
  CHECK(kind<>'employment' OR (details->>'fromAcceptedOffer')::boolean=(offer_application_id IS NOT NULL)),
  CHECK(offer_application_id IS NULL OR offer_application_id=application_id),
  CHECK(kind='employment' OR (application_id IS NULL AND offer_application_id IS NULL))
);
CREATE INDEX career_document_references ON career_events(user_id,version_id) WHERE version_id IS NOT NULL;
CREATE FUNCTION fats_immutable_career_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Career Vault history is immutable'; END;
$$;
CREATE TRIGGER career_events_immutable BEFORE UPDATE ON career_events FOR EACH ROW EXECUTE FUNCTION fats_immutable_career_event();

CREATE TABLE offers (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  state text NOT NULL CHECK (state IN ('reviewing','accepted','declined','withdrawn')),
  checklist jsonb NOT NULL CHECK (jsonb_typeof(checklist)='array' AND jsonb_array_length(checklist)=10),
  questions text NOT NULL DEFAULT '' CHECK (length(questions)<=5000),
  PRIMARY KEY(user_id,application_id),
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE RESTRICT
);
CREATE TABLE offer_events (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  application_id text NOT NULL,
  sequence integer NOT NULL CHECK(sequence>0),
  request_id uuid NOT NULL,
  fingerprint text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('terms','negotiation','decision','review')),
  occurred_on text NOT NULL CHECK(occurred_on ~ '^\d{4}-\d{2}-\d{2}$'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text NOT NULL CHECK(length(notes)<=5000),
  terms jsonb,
  version_id uuid,
  decision text CHECK(decision IN ('reviewing','accepted','declined','withdrawn')),
  review jsonb,
  PRIMARY KEY(user_id,application_id,sequence),
  UNIQUE(user_id,request_id),
  FOREIGN KEY(user_id,application_id) REFERENCES offers(user_id,application_id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,version_id) REFERENCES document_versions(user_id,id) ON DELETE RESTRICT,
  CHECK ((kind='terms')=(terms IS NOT NULL)),
  CHECK ((kind='decision')=(decision IS NOT NULL)),
  CHECK ((kind='review')=(review IS NOT NULL)),
  CHECK (version_id IS NULL OR kind='terms'),
  CHECK (terms IS NULL OR jsonb_typeof(terms)='object'),
  CHECK (terms IS NULL OR terms->>'documentVersionId'=COALESCE(version_id::text,''))
);
CREATE INDEX offer_document_references ON offer_events(user_id,version_id) WHERE version_id IS NOT NULL;
CREATE FUNCTION fats_immutable_offer_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Offer history is immutable'; END;
$$;
CREATE TRIGGER offer_events_immutable BEFORE UPDATE ON offer_events FOR EACH ROW EXECUTE FUNCTION fats_immutable_offer_event();

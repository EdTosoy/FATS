-- Durable intent precedes any private file write. No cascading deletion of bytes.
CREATE TABLE document_objects (
  storage_key uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX document_objects_owner ON document_objects(user_id);
INSERT INTO document_objects(storage_key,user_id)
  SELECT storage_key,user_id FROM document_versions;
CREATE TABLE account_erasures (
  receipt_hash text PRIMARY KEY,
  user_id uuid UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((user_id IS NULL) = (completed_at IS NOT NULL))
);
CREATE TABLE document_upload_usage (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts > 0),
  PRIMARY KEY(user_id,window_start)
);

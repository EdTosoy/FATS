CREATE TABLE documents (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  category text NOT NULL CHECK (category IN ('Resumes','Cover letters','Certificates','Other application documents')),
  archived boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,id),
  CHECK (NOT is_default OR (category='Resumes' AND NOT archived))
);
CREATE UNIQUE INDEX documents_default_resume ON documents(user_id) WHERE is_default;
CREATE TABLE document_versions (
  user_id uuid NOT NULL,
  document_id uuid NOT NULL,
  id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number BETWEEN 1 AND 20),
  original_filename text NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 240),
  format text NOT NULL CHECK (format IN ('pdf','docx')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  storage_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,id),
  UNIQUE(user_id,document_id,id),
  UNIQUE(user_id,document_id,version_number),
  FOREIGN KEY(user_id,document_id) REFERENCES documents(user_id,id) ON DELETE RESTRICT
);
CREATE TABLE application_document_versions (
  user_id uuid NOT NULL,
  application_id text NOT NULL,
  document_id uuid NOT NULL,
  version_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,application_id),
  FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(user_id,document_id,version_id) REFERENCES document_versions(user_id,document_id,id) ON DELETE RESTRICT
);
CREATE INDEX application_documents_version ON application_document_versions(user_id,version_id);
-- Immutable file metadata protects submitted history even from accidental SQL updates.
CREATE FUNCTION fats_immutable_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Document versions are immutable'; END;
$$;
CREATE TRIGGER document_versions_immutable BEFORE UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION fats_immutable_document_version();
CREATE TABLE document_garbage (
  storage_key uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

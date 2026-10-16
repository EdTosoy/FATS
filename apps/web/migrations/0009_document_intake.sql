-- Security state is separate from immutable document/version identity and bytes.
-- Existing files have no scan evidence: never manufacture a clean result.
ALTER TABLE document_objects
  ADD COLUMN intake_state text NOT NULL DEFAULT 'legacy' CHECK(intake_state IN ('legacy','quarantined','accepted')),
  ADD COLUMN accepted_sha256 text,
  ADD COLUMN scan_engine text,
  ADD COLUMN signature_revision text,
  ADD COLUMN signature_at timestamptz,
  ADD COLUMN scanned_at timestamptz,
  ADD CONSTRAINT accepted_document_evidence CHECK (
    intake_state <> 'accepted' OR (
      accepted_sha256 ~ '^[a-f0-9]{64}$' AND accepted_sha256 IS NOT NULL AND
      scan_engine IS NOT NULL AND signature_revision IS NOT NULL AND signature_at IS NOT NULL AND scanned_at IS NOT NULL
    )
  );

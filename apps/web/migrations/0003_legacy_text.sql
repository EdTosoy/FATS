-- Version 1 backups validate trimmed field lengths but retain original text.
-- Raw SQL length limits could reject an otherwise valid legacy backup solely
-- because of surrounding whitespace. Shared domain validation enforces lengths
-- on every server write/read; retain SQL identity, status, and relation checks.
ALTER TABLE applications
  DROP CONSTRAINT applications_title_check,
  DROP CONSTRAINT applications_company_check,
  DROP CONSTRAINT "applications_sourceUrl_check",
  DROP CONSTRAINT applications_location_check,
  DROP CONSTRAINT applications_description_check;
ALTER TABLE applications
  ADD CHECK (length(title) > 0),
  ADD CHECK (length(company) > 0),
  ADD CHECK (length("sourceUrl") > 0),
  ADD CHECK (length(location) > 0);
ALTER TABLE interviews
  DROP CONSTRAINT interviews_title_check,
  DROP CONSTRAINT "interviews_meetingUrl_check",
  DROP CONSTRAINT interviews_location_check,
  DROP CONSTRAINT "interviews_preparationNotes_check",
  DROP CONSTRAINT interviews_reflections_check;
ALTER TABLE interviews ADD CHECK (length(title) > 0);

-- User-scoped keys retain legacy record IDs without global collisions.
CREATE TABLE workspaces (
  user_id uuid PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
CREATE TABLE applications (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 256),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  company text NOT NULL CHECK (length(company) BETWEEN 1 AND 160),
  "sourceUrl" text NOT NULL CHECK (length("sourceUrl") BETWEEN 1 AND 2048),
  location text NOT NULL CHECK (length(location) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(description) <= 20000),
  status text NOT NULL CHECK (status IN ('Saved','Applied','Assessment','Interview','Offer','Rejected','Withdrawn')),
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX applications_recent ON applications(user_id, "updatedAt" DESC);
CREATE TABLE interviews (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 256),
  "applicationId" text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  stage text NOT NULL CHECK (stage IN ('HR','Technical','Behavioral','Final','Custom')),
  "scheduledAt" timestamptz NOT NULL,
  "timeZone" text NOT NULL,
  "meetingUrl" text NOT NULL CHECK (length("meetingUrl") <= 2048),
  location text NOT NULL CHECK (length(location) <= 500),
  "preparationNotes" text NOT NULL CHECK (length("preparationNotes") <= 20000),
  reflections text NOT NULL CHECK (length(reflections) <= 20000),
  status text NOT NULL CHECK (status IN ('scheduled','completed','cancelled')),
  "createdAt" timestamptz NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  CHECK (length("meetingUrl") > 0 OR length(location) > 0),
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, "applicationId") REFERENCES applications(user_id, id) ON DELETE RESTRICT
);
CREATE INDEX interviews_schedule ON interviews(user_id, "scheduledAt");
CREATE INDEX interviews_parent ON interviews(user_id, "applicationId");
CREATE TABLE workspace_stages (
  token uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('restore','migration')),
  data jsonb NOT NULL,
  base_revision bigint NOT NULL,
  fingerprint text NOT NULL,
  "exportedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  applied boolean NOT NULL DEFAULT false
);
CREATE INDEX workspace_stages_owner ON workspace_stages(user_id, "expiresAt");
CREATE TABLE local_migrations (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  "completedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fingerprint)
);

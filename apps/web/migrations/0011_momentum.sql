-- One date per owner, recorded in the same transaction as meaningful work.
CREATE TABLE momentum_days (
  user_id uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  active_on date NOT NULL,
  PRIMARY KEY (user_id, active_on)
);

-- Only immutable creation timestamps establish historical activity. updatedAt,
-- scheduled interview dates, offer received dates, and import time do not.
INSERT INTO momentum_days(user_id, active_on)
SELECT user_id, ("createdAt" AT TIME ZONE 'Asia/Manila')::date FROM applications
UNION
SELECT user_id, ("createdAt" AT TIME ZONE 'Asia/Manila')::date FROM interviews
UNION
SELECT v.user_id, (min(v.created_at) AT TIME ZONE 'Asia/Manila')::date
FROM document_versions v JOIN document_objects o USING(storage_key)
WHERE o.intake_state='accepted' AND o.accepted_sha256=v.sha256
GROUP BY v.user_id, v.sha256
UNION
SELECT user_id, (min(recorded_at) AT TIME ZONE 'Asia/Manila')::date
FROM offer_events WHERE kind='terms' GROUP BY user_id, application_id
ON CONFLICT DO NOTHING;

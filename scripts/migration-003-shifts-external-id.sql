ALTER TABLE shifts
ALTER COLUMN external_id SET NOT NULL;

ALTER TABLE shifts
ADD CONSTRAINT shifts_external_id_key UNIQUE (external_id);

CREATE SEQUENCE IF NOT EXISTS shifts_external_id_seq
START WITH 1000000;

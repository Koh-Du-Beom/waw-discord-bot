\set ON_ERROR_STOP on

CREATE ROLE spike_web LOGIN PASSWORD :'web_password';
CREATE ROLE spike_worker LOGIN PASSWORD :'worker_password';

CREATE TABLE spike_requests (
  operation_id uuid PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('read', 'mutation', 'high_risk')),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz
);
CREATE TABLE spike_results (
  operation_id uuid PRIMARY KEY REFERENCES spike_requests(operation_id),
  allowed boolean NOT NULL,
  role_name text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE spike_private_fixture (value text NOT NULL);

REVOKE ALL ON spike_requests, spike_results, spike_private_fixture FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO spike_web, spike_worker;
GRANT INSERT, SELECT ON spike_requests TO spike_web;
GRANT SELECT ON spike_results TO spike_web;
GRANT SELECT, UPDATE ON spike_requests TO spike_worker;
GRANT INSERT, SELECT ON spike_results TO spike_worker;

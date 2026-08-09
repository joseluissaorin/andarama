-- ULL360 esquema inicial. Dialecto SQLite (D1 y better-sqlite3).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,
  idp_subject TEXT,
  role_global TEXT NOT NULL DEFAULT 'user',
  totp_secret TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  avatar TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX users_email_idx ON users (email);
CREATE INDEX users_idp_idx ON users (idp_subject);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  totp_ok INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_exp_idx ON sessions (expires_at);

CREATE TABLE email_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX email_tokens_user_idx ON email_tokens (user_id);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hash TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX api_tokens_hash_idx ON api_tokens (hash);
CREATE INDEX api_tokens_user_idx ON api_tokens (user_id);

CREATE TABLE orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  quota_bytes INTEGER NOT NULL DEFAULT 5368709120,
  quota_tours INTEGER NOT NULL DEFAULT 100,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX orgs_slug_idx ON orgs (slug);

CREATE TABLE org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user_idx ON org_members (user_id);

CREATE TABLE org_invites (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX org_invites_org_idx ON org_invites (org_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  folder TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  settings_json TEXT NOT NULL DEFAULT '{}',
  is_template INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX projects_org_slug_idx ON projects (org_id, slug);
CREATE INDEX projects_org_idx ON projects (org_id);
CREATE INDEX projects_status_idx ON projects (status);

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_idx ON project_members (user_id);

CREATE TABLE scenes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'image',
  media_id TEXT,
  source_json TEXT,
  initial_view_json TEXT,
  limits_json TEXT,
  audio_json TEXT,
  map_json TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX scenes_project_idx ON scenes (project_id);

CREATE TABLE hotspots (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  position_json TEXT NOT NULL DEFAULT '{}',
  style_json TEXT,
  content_json TEXT NOT NULL DEFAULT '{}',
  conditions_json TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX hotspots_scene_idx ON hotspots (scene_id);

CREATE TABLE connections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_scene TEXT NOT NULL,
  to_scene TEXT NOT NULL,
  entry_mode TEXT NOT NULL DEFAULT 'relative',
  entry_view_json TEXT,
  transition_json TEXT
);
CREATE INDEX connections_project_idx ON connections (project_id);
CREATE INDEX connections_from_idx ON connections (from_scene);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  folder TEXT,
  sha256 TEXT,
  bytes INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  exif_json TEXT,
  r2_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading',
  stream_uid TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX media_org_idx ON media (org_id);
CREATE INDEX media_sha_idx ON media (org_id, sha256);
CREATE INDEX media_kind_idx ON media (org_id, kind);

CREATE TABLE media_derivatives (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  r2_prefix TEXT NOT NULL,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX media_derivatives_media_idx ON media_derivatives (media_id);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  tour_json_key TEXT NOT NULL,
  created_by TEXT NOT NULL,
  note TEXT,
  kind TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX versions_project_number_idx ON versions (project_id, number);
CREATE INDEX versions_project_idx ON versions (project_id);

CREATE TABLE publications (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  version_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public',
  password_hash TEXT,
  domains_json TEXT,
  publish_at INTEGER,
  expire_at INTEGER,
  lti_json TEXT,
  published_at INTEGER NOT NULL,
  published_by TEXT NOT NULL
);
CREATE UNIQUE INDEX publications_slug_idx ON publications (slug);

CREATE TABLE translations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL
);
CREATE UNIQUE INDEX translations_unique_idx ON translations (project_id, lang, entity, entity_id, field);
CREATE INDEX translations_project_lang_idx ON translations (project_id, lang);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id TEXT,
  hotspot_id TEXT,
  parent_id TEXT,
  author_id TEXT NOT NULL,
  body TEXT NOT NULL,
  anchor_json TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX comments_project_idx ON comments (project_id);
CREATE INDEX comments_scene_idx ON comments (scene_id);

CREATE TABLE form_submissions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  hotspot_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  lang TEXT,
  created_at INTEGER NOT NULL,
  ip_hash TEXT
);
CREATE INDEX form_submissions_project_idx ON form_submissions (project_id);

CREATE TABLE quiz_results (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  max_score INTEGER NOT NULL,
  passed INTEGER,
  detail_json TEXT NOT NULL DEFAULT '{}',
  lti_launch_json TEXT,
  participant_name TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX quiz_results_project_idx ON quiz_results (project_id);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_status_idx ON jobs (status);
CREATE INDEX jobs_org_idx ON jobs (org_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT,
  at INTEGER NOT NULL
);
CREATE INDEX audit_org_idx ON audit_log (org_id);
CREATE INDEX audit_at_idx ON audit_log (at);

CREATE TABLE instance_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT,
  url TEXT NOT NULL,
  events_json TEXT NOT NULL DEFAULT '[]',
  secret TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX webhooks_org_idx ON webhooks (org_id);

CREATE TABLE lti_registrations (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  deployment_id TEXT,
  auth_url TEXT NOT NULL,
  token_url TEXT NOT NULL,
  jwks_url TEXT NOT NULL,
  tool_key_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX lti_issuer_client_idx ON lti_registrations (issuer, client_id);

CREATE TABLE analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  tour_slug TEXT NOT NULL,
  event TEXT NOT NULL,
  scene_id TEXT,
  hotspot_id TEXT,
  lang TEXT,
  device TEXT,
  country TEXT,
  referer_host TEXT,
  session_hash TEXT,
  duration_ms INTEGER,
  yaw_bucket INTEGER,
  pitch_bucket INTEGER,
  meta_json TEXT
);
CREATE INDEX analytics_slug_ts_idx ON analytics_events (tour_slug, ts);

import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Esquema de base de datos de ULL360. Dialecto SQLite, compartido entre
 * Cloudflare D1 y better-sqlite3 (self-host). Los timestamps son epoch ms.
 * Los IDs son nanoid/uuidv7 no adivinables generados en la capa de API.
 */

// ---------------------------------------------------------------------------
// Usuarios, sesiones y autenticacion
// ---------------------------------------------------------------------------

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    /** subject del IdP OIDC (SSO institucional). */
    idpSubject: text("idp_subject"),
    /** admin | user */
    roleGlobal: text("role_global").notNull().default("user"),
    totpSecret: text("totp_secret"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    avatar: text("avatar"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_idp_idx").on(t.idpSubject)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    /** Segundo factor completado (si el usuario tiene TOTP). */
    totpOk: integer("totp_ok", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_exp_idx").on(t.expiresAt)],
);

export const emailTokens = sqliteTable(
  "email_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** verify | reset */
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("email_tokens_user_idx").on(t.userId)],
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hash: text("hash").notNull(),
    /** JSON: lista de scopes ("projects:read", "projects:write", "media:write", "publish", "admin"). */
    scopesJson: text("scopes_json").notNull().default("[]"),
    lastUsedAt: integer("last_used_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("api_tokens_hash_idx").on(t.hash), index("api_tokens_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Organizaciones y pertenencia
// ---------------------------------------------------------------------------

export const orgs = sqliteTable(
  "orgs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    quotaBytes: integer("quota_bytes").notNull().default(5368709120),
    quotaTours: integer("quota_tours").notNull().default(100),
    settingsJson: text("settings_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("orgs_slug_idx").on(t.slug)],
);

export const orgMembers = sqliteTable(
  "org_members",
  {
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** admin | editor | collaborator | reader */
    role: text("role").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("org_members_user_idx").on(t.userId)],
);

export const orgInvites = sqliteTable(
  "org_invites",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("org_invites_org_idx").on(t.orgId)],
);

// ---------------------------------------------------------------------------
// Proyectos (tours) y contenido en borrador
// ---------------------------------------------------------------------------

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    folder: text("folder"),
    /** JSON: lista de etiquetas. */
    tagsJson: text("tags_json").notNull().default("[]"),
    /** draft | published | trashed */
    status: text("status").notNull().default("draft"),
    /** Ajustes a nivel de tour: meta, ui, transition, controls, autorotate, autopilot,
     *  variables, quiz, treasureHunt, globalAudio, analytics, floorplans, geoMap, langs. */
    settingsJson: text("settings_json").notNull().default("{}"),
    /** Este proyecto es una plantilla reutilizable. */
    isTemplate: integer("is_template", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    /** Papelera con retencion de 30 dias. */
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    uniqueIndex("projects_org_slug_idx").on(t.orgId, t.slug),
    index("projects_org_idx").on(t.orgId),
    index("projects_status_idx").on(t.status),
  ],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** editor | collaborator | reader */
    role: text("role").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userId] }), index("project_members_user_idx").on(t.userId)],
);

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sort: integer("sort").notNull().default(0),
    /** Titulo en el idioma por defecto (las traducciones van en `translations`). */
    title: text("title").notNull(),
    /** image | video | flat */
    type: text("type").notNull().default("image"),
    mediaId: text("media_id"),
    /** Fuente compilada/override (JSON SceneSource); si null se deriva del media. */
    sourceJson: text("source_json"),
    initialViewJson: text("initial_view_json"),
    limitsJson: text("limits_json"),
    audioJson: text("audio_json"),
    mapJson: text("map_json"),
    /** altText, description, category, hidden, autorotate, thumbnail... */
    metaJson: text("meta_json").notNull().default("{}"),
  },
  (t) => [index("scenes_project_idx").on(t.projectId)],
);

export const hotspots = sqliteTable(
  "hotspots",
  {
    id: text("id").primaryKey(),
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    /** JSON: { yaw, pitch } (o points para poligonos). */
    positionJson: text("position_json").notNull().default("{}"),
    styleJson: text("style_json"),
    /** Contenido especifico del tipo (idioma por defecto). */
    contentJson: text("content_json").notNull().default("{}"),
    conditionsJson: text("conditions_json"),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("hotspots_scene_idx").on(t.sceneId)],
);

// ---------------------------------------------------------------------------
// Medios
// ---------------------------------------------------------------------------

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** panorama | image | video | audio | pdf | model | floorplan | subtitle | file */
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    folder: text("folder"),
    /** Tour al que pertenece el medio (opcional; la biblioteca se organiza por tour). */
    projectId: text("project_id"),
    sha256: text("sha256"),
    bytes: integer("bytes").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    /** Duracion en segundos (audio/video). */
    duration: integer("duration"),
    exifJson: text("exif_json"),
    r2Key: text("r2_key").notNull(),
    /** uploading | ready | processing | error */
    status: text("status").notNull().default("uploading"),
    /** UID de Cloudflare Stream si aplica. */
    streamUid: text("stream_uid"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    deletedAt: integer("deleted_at"),
  },
  (t) => [
    index("media_org_idx").on(t.orgId),
    index("media_sha_idx").on(t.orgId, t.sha256),
    index("media_kind_idx").on(t.orgId, t.kind),
  ],
);

export const mediaDerivatives = sqliteTable(
  "media_derivatives",
  {
    id: text("id").primaryKey(),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    /** tiles | preview | thumb | og | transcode | flat_tiles */
    kind: text("kind").notNull(),
    r2Prefix: text("r2_prefix").notNull(),
    /** Para tiles: { levels, tileSize, faceSize, extension, formats, tileCount }. */
    manifestJson: text("manifest_json").notNull().default("{}"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("media_derivatives_media_idx").on(t.mediaId)],
);

// ---------------------------------------------------------------------------
// Versiones y publicaciones
// ---------------------------------------------------------------------------

export const versions = sqliteTable(
  "versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** Clave R2/almacenamiento del tour.json congelado. */
    tourJsonKey: text("tour_json_key").notNull(),
    createdBy: text("created_by").notNull(),
    note: text("note"),
    /** publish | manual | auto */
    kind: text("kind").notNull().default("manual"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("versions_project_number_idx").on(t.projectId, t.number),
    index("versions_project_idx").on(t.projectId),
  ],
);

export const publications = sqliteTable(
  "publications",
  {
    projectId: text("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    versionId: text("version_id").notNull(),
    slug: text("slug").notNull(),
    /** public | unlisted | password | org | domains */
    visibility: text("visibility").notNull().default("public"),
    passwordHash: text("password_hash"),
    /** JSON: allowlist de dominios de embebido (frame-ancestors / Referer). */
    domainsJson: text("domains_json"),
    /** Dominio propio (CNAME) bajo el que se sirve el tour en la raiz. */
    customDomain: text("custom_domain"),
    publishAt: integer("publish_at"),
    expireAt: integer("expire_at"),
    ltiJson: text("lti_json"),
    publishedAt: integer("published_at").notNull(),
    publishedBy: text("published_by").notNull(),
  },
  (t) => [uniqueIndex("publications_slug_idx").on(t.slug)],
);

// ---------------------------------------------------------------------------
// Traducciones, comentarios, formularios, quizzes
// ---------------------------------------------------------------------------

export const translations = sqliteTable(
  "translations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    /** tour | scene | hotspot */
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    value: text("value").notNull(),
  },
  (t) => [
    uniqueIndex("translations_unique_idx").on(t.projectId, t.lang, t.entity, t.entityId, t.field),
    index("translations_project_lang_idx").on(t.projectId, t.lang),
  ],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sceneId: text("scene_id"),
    hotspotId: text("hotspot_id"),
    parentId: text("parent_id"),
    authorId: text("author_id").notNull(),
    body: text("body").notNull(),
    /** Anclaje opcional { yaw, pitch } en la escena. */
    anchorJson: text("anchor_json"),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("comments_project_idx").on(t.projectId), index("comments_scene_idx").on(t.sceneId)],
);

export const formSubmissions = sqliteTable(
  "form_submissions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    hotspotId: text("hotspot_id").notNull(),
    dataJson: text("data_json").notNull(),
    lang: text("lang"),
    createdAt: integer("created_at").notNull(),
    ipHash: text("ip_hash"),
  },
  (t) => [index("form_submissions_project_idx").on(t.projectId)],
);

export const quizResults = sqliteTable(
  "quiz_results",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    sessionId: text("session_id").notNull(),
    score: integer("score").notNull(),
    maxScore: integer("max_score").notNull(),
    passed: integer("passed", { mode: "boolean" }),
    detailJson: text("detail_json").notNull().default("{}"),
    /** Datos del launch LTI para devolucion de calificacion (AGS). */
    ltiLaunchJson: text("lti_launch_json"),
    participantName: text("participant_name"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("quiz_results_project_idx").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// Trabajos, auditoria, ajustes, webhooks, LTI, analitica self-host
// ---------------------------------------------------------------------------

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull(),
    /** tile | transcode | export | og | backup */
    kind: text("kind").notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    /** queued | running | done | error */
    status: text("status").notNull().default("queued"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("jobs_status_idx").on(t.status), index("jobs_org_idx").on(t.orgId)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    userId: text("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detailJson: text("detail_json"),
    at: integer("at").notNull(),
  },
  (t) => [index("audit_org_idx").on(t.orgId), index("audit_at_idx").on(t.at)],
);

export const instanceSettings = sqliteTable("instance_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id"),
    projectId: text("project_id"),
    url: text("url").notNull(),
    /** JSON: eventos suscritos ("publish", "unpublish", "form_submission"). */
    eventsJson: text("events_json").notNull().default("[]"),
    secret: text("secret"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("webhooks_org_idx").on(t.orgId)],
);

export const ltiRegistrations = sqliteTable(
  "lti_registrations",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    clientId: text("client_id").notNull(),
    deploymentId: text("deployment_id"),
    authUrl: text("auth_url").notNull(),
    tokenUrl: text("token_url").notNull(),
    jwksUrl: text("jwks_url").notNull(),
    /** Clave privada RSA (JWK) de la herramienta para firmar. */
    toolKeyJson: text("tool_key_json").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("lti_issuer_client_idx").on(t.issuer, t.clientId)],
);

/** Analitica en self-host (en Cloudflare se usa Workers Analytics Engine). */
export const analyticsEvents = sqliteTable(
  "analytics_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts").notNull(),
    tourSlug: text("tour_slug").notNull(),
    /** view | scene | hotspot | duration | quiz | form | share | vr */
    event: text("event").notNull(),
    sceneId: text("scene_id"),
    hotspotId: text("hotspot_id"),
    lang: text("lang"),
    /** mobile | tablet | desktop | vr */
    device: text("device"),
    country: text("country"),
    refererHost: text("referer_host"),
    /** Hash diario anonimo (sin cookies). */
    sessionHash: text("session_hash"),
    durationMs: integer("duration_ms"),
    /** yaw/pitch cuantizados para mapa de calor de orientaciones. */
    yawBucket: integer("yaw_bucket"),
    pitchBucket: integer("pitch_bucket"),
    metaJson: text("meta_json"),
  },
  (t) => [index("analytics_slug_ts_idx").on(t.tourSlug, t.ts)],
);

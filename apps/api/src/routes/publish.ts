import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { projects, publications, users, versions, webhooks } from "@andarama/db";
import type { AppEnv, Db } from "../lib/context.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { newId, nowMs, parseJson, slugify } from "../lib/util.js";
import { requireAuth, requireScope } from "../lib/session.js";
import { templateOrgIds } from "../lib/templates.js";
import { isInstanceAdmin, projectAccess } from "../lib/authz.js";
import { audit } from "../lib/helpers.js";
import { assertTourQuota } from "../lib/quota.js";
import { orgHas, requireActivePlan, requireOrgCapability } from "../lib/capabilities.js";
import { compileProject } from "../compiler.js";
import { hmacSign } from "@andarama/adapters";

/**
 * Publicar = congelar una version inmutable en el almacenamiento (§5.4):
 *   pub/{slug}/{n}/tour.json  - tour compilado
 *   pub/{slug}/{n}/map.json   - mapa de assets (ruta relativa -> clave)
 *   pub/{slug}/current.json   - puntero: version activa + proteccion
 * El servido de /t/{slug} lee SOLO del almacenamiento (nunca de la DB).
 */

export interface PublicationPointer {
  version: number;
  visibility: "public" | "unlisted" | "password" | "org" | "domains";
  passwordHash?: string;
  domains?: string[];
  publishAt?: number;
  expireAt?: number;
  title: string;
  ogImage?: string;
  description?: string;
  defaultLang: string;
  analytics: boolean;
  turnstile?: boolean;
  /** El enlace abre el recorrido en modo quiosco (bucle y liberación). */
  kiosk?: boolean;
  /**
   * Insignia «Hecho con Andarama» (instancia alojada, planes sin marca
   * blanca). Se decide al publicar porque el servido no toca la base de datos.
   */
  badge?: boolean;
}

/**
 * Lo que pide una ficha de la galería. Los límites son los del buscador: un
 * título corto con el nombre del lugar y una descripción de un párrafo (300 a
 * 600 caracteres), en un solo idioma. Con `enabled: false` solo se apaga; los
 * textos se guardan por si se vuelve a encender.
 */
export const gallerySchema = z
  .object({
    enabled: z.boolean(),
    title: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(300).max(600).optional(),
    credits: z.string().trim().max(1000).optional(),
    placeName: z.string().trim().min(2).max(120).optional(),
    placeCountry: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "País en ISO 3166-1 alfa-2").optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    lang: z.string().trim().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/).optional(),
  })
  .refine((g) => (g.lat == null) === (g.lng == null), { message: "Las coordenadas van juntas: latitud y longitud" });

export type GalleryInput = z.infer<typeof gallerySchema>;

/** Columnas de la galería tal como van a la tabla `publications`. */
export interface GalleryColumns {
  inGallery: boolean;
  galleryTitle: string | null;
  galleryDescription: string | null;
  galleryCredits: string | null;
  placeName: string | null;
  placeCountry: string | null;
  placeLat: number | null;
  placeLng: number | null;
  galleryLang: string | null;
}

/**
 * Resuelve las columnas de la galería para esta publicación: lo que manda el
 * cuerpo, si manda algo; si no, lo que ya había. Solo una publicación pública
 * puede estar en la galería: al cambiar la visibilidad se apaga sola.
 */
export function resolveGallery(
  body: GalleryInput | undefined,
  existing: GalleryColumns | undefined,
  visibility: string,
  defaultLang: string,
): GalleryColumns {
  // Solo las columnas de la galería: `existing` suele ser la fila entera de
  // `publications`, y esparcirla en el `.set()` machacaría versión y slug
  const base: GalleryColumns = {
    inGallery: existing?.inGallery ?? false,
    galleryTitle: existing?.galleryTitle ?? null,
    galleryDescription: existing?.galleryDescription ?? null,
    galleryCredits: existing?.galleryCredits ?? null,
    placeName: existing?.placeName ?? null,
    placeCountry: existing?.placeCountry ?? null,
    placeLat: existing?.placeLat ?? null,
    placeLng: existing?.placeLng ?? null,
    galleryLang: existing?.galleryLang ?? null,
  };
  if (body == null) return { ...base, inGallery: base.inGallery && visibility === "public" };
  if (body.enabled && visibility !== "public") {
    throw badRequest("Solo un tour público puede mostrarse en la galería");
  }
  const merged: GalleryColumns = {
    inGallery: body.enabled,
    galleryTitle: body.title ?? base.galleryTitle,
    galleryDescription: body.description ?? base.galleryDescription,
    galleryCredits: body.credits === undefined ? base.galleryCredits : body.credits === "" ? null : body.credits,
    placeName: body.placeName ?? base.placeName,
    placeCountry: body.placeCountry ?? base.placeCountry,
    placeLat: body.lat === undefined ? base.placeLat : body.lat,
    placeLng: body.lng === undefined ? base.placeLng : body.lng,
    galleryLang: body.lang ?? base.galleryLang ?? defaultLang,
  };
  // Se exige sobre lo fusionado: volver a encender la ficha con solo
  // `enabled: true` reutiliza los textos guardados
  if (
    merged.inGallery &&
    (merged.galleryTitle == null || merged.galleryDescription == null || merged.placeName == null || merged.placeCountry == null)
  ) {
    throw badRequest("La ficha de la galería necesita título, descripción, lugar y país");
  }
  return merged;
}

/** Estado de moderación de una ficha: solo las aprobadas se listan en /explorar/. */
export type GalleryStatus = "off" | "pending" | "approved" | "rejected";

export interface GalleryReview {
  galleryApproved: boolean;
  galleryReviewedAt: number | null;
}

export function galleryStatus(g: { inGallery: boolean } & Partial<GalleryReview>): GalleryStatus {
  if (!g.inGallery) return "off";
  if (g.galleryApproved === true) return "approved";
  return g.galleryReviewedAt != null ? "rejected" : "pending";
}

/** Los textos que se moderan: si cambia cualquiera, la ficha vuelve a revisión. */
const GALLERY_REVIEWED_FIELDS = [
  "galleryTitle", "galleryDescription", "galleryCredits", "placeName", "placeCountry", "placeLat", "placeLng", "galleryLang",
] as const satisfies readonly (keyof GalleryColumns)[];

export function sameGalleryTexts(a: GalleryColumns, b: GalleryColumns): boolean {
  return GALLERY_REVIEWED_FIELDS.every((k) => a[k] === b[k]);
}

/**
 * Moderación de la galería: la campaña trae desconocidos y una ficha basura
 * indexada daña la marca. Una ficha nueva o con los textos cambiados queda
 * pendiente hasta que la apruebe un administrador; republicar el contenido
 * sin tocar la ficha conserva la revisión. Lo que publica un administrador
 * de la instancia entra aprobado.
 */
export function resolveGalleryReview(
  next: GalleryColumns,
  existing: (GalleryColumns & GalleryReview) | undefined,
  byInstanceAdmin: boolean,
  now: number,
): GalleryReview {
  if (next.inGallery && byInstanceAdmin) return { galleryApproved: true, galleryReviewedAt: now };
  if (existing != null && sameGalleryTexts(existing, next)) {
    return { galleryApproved: existing.galleryApproved, galleryReviewedAt: existing.galleryReviewedAt };
  }
  return { galleryApproved: false, galleryReviewedAt: null };
}

/** La ficha de la galería tal como la ve el Studio (para rellenar el diálogo). */
export function galleryInfo(g: GalleryColumns & Partial<GalleryReview>): {
  status: GalleryStatus;
  enabled: boolean;
  title: string | null;
  description: string | null;
  credits: string | null;
  placeName: string | null;
  placeCountry: string | null;
  lat: number | null;
  lng: number | null;
  lang: string | null;
} {
  return {
    status: galleryStatus(g),
    enabled: g.inGallery,
    title: g.galleryTitle,
    description: g.galleryDescription,
    credits: g.galleryCredits,
    placeName: g.placeName,
    placeCountry: g.placeCountry,
    lat: g.placeLat,
    lng: g.placeLng,
    lang: g.galleryLang,
  };
}

/**
 * Las páginas y el listado de la galería se cachean en KV bajo una
 * «generación»; publicar o despublicar la cambia y las entradas viejas
 * caducan solas. Evita tener que enumerar claves por idioma, país y página.
 */
export async function bumpGalleryGeneration(kv: { put(key: string, value: string): Promise<void> }): Promise<void> {
  await kv.put("gallery:gen", String(Date.now()));
}

const publishSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).optional(),
  visibility: z.enum(["public", "unlisted", "password", "org", "domains"]).default("public"),
  password: z.string().min(4).max(100).optional(),
  domains: z.array(z.string().max(200)).optional(),
  customDomain: z
    .string()
    .max(200)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Dominio no válido")
    .nullable()
    .optional(),
  publishAt: z.number().optional(),
  expireAt: z.number().optional(),
  /** Cómo se abre el enlace: recorrido normal (false) o quiosco (true). */
  kiosk: z.boolean().optional(),
  note: z.string().max(500).optional(),
  /** Portada para compartir capturada por el editor: la escena inicial con la
   *  proyección real del visor, como data URL JPEG. */
  shareImage: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(2_000_000)
    .optional(),
  /** Ficha en la galería pública (/explorar/). Si falta, se conserva la anterior. */
  gallery: gallerySchema.optional(),
});

export function publishRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.post("/:projectId/publish", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden("Tu rol no permite publicar");
    // Al caducar la prueba lo publicado sigue en línea, pero republicar pide plan
    await requireActivePlan(db, c.get("config"), access.project.orgId);
    const body = publishSchema.parse(await c.req.json().catch(() => ({})));
    if (body.visibility === "password" && body.password == null) {
      const existing = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
      if (existing?.passwordHash == null) throw badRequest("La visibilidad por contraseña requiere una contraseña");
    }

    const compiled = await compileProject(db, access.project.id, { sharedOrgIds: await templateOrgIds(db, c.get("config")) });
    const errors = compiled.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      throw badRequest("El tour tiene errores que impiden publicar", { issues: errors });
    }

    // Slug de publicacion. Es único en toda la instancia, así que dos docentes
    // con un proyecto «prueba» chocaban con un 409 sin salida. Ahora:
    //  - el propio slug (republicar) se reutiliza siempre;
    //  - si lo tiene otra organización, se añade un sufijo y se avisa;
    //  - si lo tiene otro recorrido de la misma organización y se ha escrito a
    //    mano, se pide otro con una sugerencia (es suyo: sabrá cuál elegir).
    const existingPub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    // La ficha de la galería se valida antes de congelar nada: un cuerpo
    // incoherente no debe dejar artefactos a medias en el almacenamiento
    const gallery = resolveGallery(body.gallery, existingPub, body.visibility, compiled.tour.meta.defaultLang);
    const review = resolveGalleryReview(gallery, existingPub, isInstanceAdmin(auth.user), nowMs());
    // Aviso a quien modera cuando una ficha entra en revisión (nueva o con textos cambiados)
    const nuevaEnRevision =
      galleryStatus({ ...gallery, ...review }) === "pending" &&
      !(existingPub != null && galleryStatus(existingPub) === "pending" && sameGalleryTexts(existingPub, gallery));
    const requestedSlug = body.slug ?? existingPub?.slug ?? (access.project.slug || slugify(access.project.title));
    const check = await checkSlug(db, requestedSlug, access.project.id, access.project.orgId);
    let slug = requestedSlug;
    let slugChanged: { requested: string; reason: "org" | "taken" } | undefined;
    if (check.status === "org" || check.status === "taken") {
      const explicit = body.slug != null && body.slug !== existingPub?.slug;
      if (check.status === "org" && explicit) {
        throw conflict(
          `Otro recorrido de tu organización ya usa la dirección «${requestedSlug}». Elige otra; por ejemplo, «${check.suggested}».`,
          { code: "slug_taken", reason: "org", suggestedSlug: check.suggested },
        );
      }
      slug = check.suggested;
      slugChanged = { requested: requestedSlug, reason: check.status };
    }

    // Numero de version
    const lastVersion = (await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number))
      .limit(1))[0];
    const number = (lastVersion?.number ?? 0) + 1;

    // Congelar artefactos
    const tourKey = `pub/${slug}/${number}/tour.json`;
    const mapKey = `pub/${slug}/${number}/map.json`;
    await runtime.storage.put(tourKey, JSON.stringify(compiled.tour), { contentType: "application/json" });
    await runtime.storage.put(mapKey, JSON.stringify({ assets: compiled.assets, prefixes: compiled.prefixes }), {
      contentType: "application/json",
    });
    // La portada capturada sirve también de cartel en la galería; si esta vez
    // no llega captura, la ficha conserva la de la versión anterior
    let posterKey = existingPub?.posterKey ?? null;
    if (body.shareImage != null) {
      const binario = atob(body.shareImage.split(",", 2)[1]!);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      posterKey = `pub/${slug}/${number}/share.jpg`;
      await runtime.storage.put(posterKey, bytes, { contentType: "image/jpeg" });
    }

    const versionId = newId();
    await db.insert(versions).values({
      id: versionId,
      projectId: access.project.id,
      number,
      tourJsonKey: tourKey,
      createdBy: auth.user.id,
      note: body.note ?? null,
      kind: "publish",
      createdAt: nowMs(),
    });

    const passwordHash =
      body.password != null ? await runtime.passwords.hash(body.password) : (existingPub?.passwordHash ?? null);

    // Dominio propio: unicidad + mapeo host->slug en KV para resolucion rapida
    const customDomain =
      body.customDomain === undefined ? (existingPub?.customDomain ?? null) : body.customDomain?.toLowerCase() ?? null;
    // El dominio propio es de los planes altos (solo en modo alojado). Se
    // exige al fijarlo; uno ya puesto no se rompe al republicar el contenido.
    if (customDomain != null && customDomain !== existingPub?.customDomain) {
      await requireOrgCapability(db, c.get("config"), access.project.orgId, "customDomain");
    }
    if (customDomain != null) {
      const domainOwner = (await db.select().from(publications).where(eq(publications.customDomain, customDomain)).limit(1))[0];
      if (domainOwner != null && domainOwner.projectId !== access.project.id) {
        throw conflict("Ese dominio ya está en uso por otra publicación");
      }
    }
    if (existingPub?.customDomain != null && existingPub.customDomain !== customDomain) {
      await runtime.kv.delete(`domain:${existingPub.customDomain}`);
    }
    if (customDomain != null) {
      await runtime.kv.put(`domain:${customDomain}`, slug);
    }

    // Republicar sin tocar el modo lo conserva: quien solo cambia el contenido
    // no tiene por qué acordarse de que aquella pantalla iba en bucle.
    const kiosk = body.kiosk ?? existingPub?.kiosk ?? false;

    const settings = parseJson<Record<string, unknown>>(access.project.settingsJson, {});
    const pointer: PublicationPointer = {
      version: number,
      visibility: body.visibility,
      passwordHash: body.visibility === "password" ? (passwordHash ?? undefined) : undefined,
      domains: body.visibility === "domains" ? (body.domains ?? []) : undefined,
      publishAt: body.publishAt,
      expireAt: body.expireAt,
      title: access.project.title,
      description: typeof settings.description === "string" ? settings.description : undefined,
      ogImage: compiled.tour.meta.ogImage,
      defaultLang: compiled.tour.meta.defaultLang,
      analytics: (compiled.tour.analytics?.enabled ?? true) !== false,
      turnstile: c.get("config").turnstileSiteKey != null,
      kiosk: kiosk ? true : undefined,
      // Sin marca blanca, el recorrido lleva la insignia; en el self-host, nunca
      badge: (await orgHas(db, c.get("config"), access.project.orgId, "whiteLabel")) ? undefined : true,
    };
    await runtime.storage.put(`pub/${slug}/current.json`, JSON.stringify(pointer), { contentType: "application/json" });
    // Cache KV del puntero: se escribe el nuevo en vez de solo borrarlo, así
    // la siguiente lectura no depende de que el borrado se haya propagado.
    await runtime.kv.put(`pub:${slug}`, JSON.stringify(pointer), { ttlSeconds: 60 });

    // Primera publicación de esta persona: el Studio lo cuenta como activación
    const firstForUser =
      existingPub == null &&
      (await db.select({ id: publications.projectId }).from(publications).where(eq(publications.publishedBy, auth.user.id)).limit(1)).length === 0;

    if (existingPub != null) {
      await db
        .update(publications)
        .set({
          versionId,
          slug,
          visibility: body.visibility,
          passwordHash,
          domainsJson: body.domains != null ? JSON.stringify(body.domains) : existingPub.domainsJson,
          customDomain,
          publishAt: body.publishAt ?? null,
          expireAt: body.expireAt ?? null,
          kiosk,
          ...gallery,
          ...review,
          posterKey,
          publishedAt: nowMs(),
          publishedBy: auth.user.id,
        })
        .where(eq(publications.projectId, access.project.id));
    } else {
      await db.insert(publications).values({
        projectId: access.project.id,
        versionId,
        slug,
        visibility: body.visibility,
        passwordHash,
        domainsJson: body.domains != null ? JSON.stringify(body.domains) : null,
        customDomain,
        publishAt: body.publishAt ?? null,
        expireAt: body.expireAt ?? null,
        kiosk,
        ...gallery,
        ...review,
        posterKey,
        publishedAt: nowMs(),
        publishedBy: auth.user.id,
      });
    }
    // La galería se cachea por generación: publicar la cambia
    await bumpGalleryGeneration(runtime.kv);
    if (nuevaEnRevision) {
      runtime.deferred(notifyGalleryReview(c, { slug, title: gallery.galleryTitle ?? access.project.title, author: auth.user.email }));
    }
    await db.update(projects).set({ status: "published", updatedAt: nowMs() }).where(eq(projects.id, access.project.id));
    await audit(c, "project.publish", "project", access.project.id, { slug, version: number }, access.project.orgId);
    await fireWebhooks(c, access.project.orgId, access.project.id, "publish", { slug, version: number });

    return c.json({
      slug,
      version: number,
      url: `${c.get("config").publicUrl}/t/${slug}`,
      // Los dos enlaces existen siempre: el de la publicación, limpio, y el
      // del otro modo con el parámetro que lo fuerza.
      kioskUrl: `${c.get("config").publicUrl}/t/${slug}${kiosk ? "" : "?kiosk=1"}`,
      tourUrl: `${c.get("config").publicUrl}/t/${slug}${kiosk ? "?kiosk=0" : ""}`,
      kiosk,
      firstForUser,
      // La dirección pedida estaba ocupada y se ha usado otra: el Studio lo
      // explica en vez de dejar que el docente lo descubra al compartir.
      slugChanged,
      gallery: galleryInfo({ ...gallery, ...review }),
      // Solo hay ficha pública cuando un administrador la ha aprobado
      galleryUrl: galleryStatus({ ...gallery, ...review }) === "approved" ? `${c.get("config").publicUrl}/explorar/${slug}/` : null,
      warnings: compiled.issues.filter((i) => i.severity === "warning"),
    }, 201);
  });

  /**
   * Disponibilidad de una dirección mientras se escribe en el diálogo de
   * publicar: evita descubrir el conflicto al pulsar el botón.
   */
  r.get("/:projectId/publish/slug", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const parsed = z.string().min(3).max(80).regex(/^[a-z0-9-]+$/).safeParse(c.req.query("slug") ?? "");
    if (!parsed.success) return c.json({ slug: c.req.query("slug") ?? "", status: "invalid" });
    const check = await checkSlug(db, parsed.data, access.project.id, access.project.orgId);
    return c.json({ slug: parsed.data, ...check });
  });

  r.post("/:projectId/unpublish", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden();
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    if (pub == null) throw notFound("El proyecto no está publicado");
    await runtime.storage.delete(`pub/${pub.slug}/current.json`);
    await runtime.kv.delete(`pub:${pub.slug}`);
    if (pub.customDomain != null) await runtime.kv.delete(`domain:${pub.customDomain}`);
    await db.delete(publications).where(eq(publications.projectId, access.project.id));
    if (pub.inGallery) await bumpGalleryGeneration(runtime.kv);
    await db.update(projects).set({ status: "draft", updatedAt: nowMs() }).where(eq(projects.id, access.project.id));
    await audit(c, "project.unpublish", "project", access.project.id, { slug: pub.slug }, access.project.orgId);
    await fireWebhooks(c, access.project.orgId, access.project.id, "unpublish", { slug: pub.slug });
    return c.json({ ok: true });
  });

  // ------- Versiones (§3.5 historial) -------

  r.get("/:projectId/versions", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const rows = await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number));
    return c.json(rows);
  });

  /** Instantanea manual con nombre. */
  r.post("/:projectId/versions", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canEdit) throw forbidden();
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(await c.req.json().catch(() => ({})));
    const compiled = await compileProject(db, access.project.id, { sharedOrgIds: await templateOrgIds(db, c.get("config")) });
    const last = (await db
      .select()
      .from(versions)
      .where(eq(versions.projectId, access.project.id))
      .orderBy(desc(versions.number))
      .limit(1))[0];
    const number = (last?.number ?? 0) + 1;
    const key = `snapshots/${access.project.id}/${number}/tour.json`;
    await runtime.storage.put(key, JSON.stringify(compiled.tour), { contentType: "application/json" });
    const id = newId();
    await db.insert(versions).values({
      id,
      projectId: access.project.id,
      number,
      tourJsonKey: key,
      createdBy: auth.user.id,
      note: note ?? null,
      kind: "manual",
      createdAt: nowMs(),
    });
    return c.json({ id, number }, 201);
  });

  /** Contenido tour.json de una version (para diff en el Studio). */
  r.get("/:projectId/versions/:number/tour", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const number = parseInt(c.req.param("number"), 10);
    const row = (await db
      .select()
      .from(versions)
      .where(and(eq(versions.projectId, access.project.id), eq(versions.number, number)))
      .limit(1))[0];
    if (row == null) throw notFound();
    const bytes = await runtime.storage.getBytes(row.tourJsonKey);
    if (bytes == null) throw notFound("El artefacto de la version no existe");
    return new Response(bytes as unknown as BodyInit, { headers: { "content-type": "application/json" } });
  });

  /** Republicar una version anterior (restaurar §3.6). */
  r.post("/:projectId/versions/:number/restore", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "publish");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    if (!access.canPublish) throw forbidden();
    // Volver a una versión anterior es republicar: pide plan como publicar
    await requireActivePlan(db, c.get("config"), access.project.orgId);
    const number = parseInt(c.req.param("number"), 10);
    const row = (await db
      .select()
      .from(versions)
      .where(and(eq(versions.projectId, access.project.id), eq(versions.number, number)))
      .limit(1))[0];
    if (row == null) throw notFound();
    const pub = (await db.select().from(publications).where(eq(publications.projectId, access.project.id)).limit(1))[0];
    if (pub == null) throw badRequest("El proyecto no está publicado; publica primero");
    // El artefacto de la version debe estar bajo pub/{slug}/ para poder servirse
    if (!row.tourJsonKey.startsWith(`pub/${pub.slug}/`)) {
      throw badRequest("Solo se pueden restaurar versiones publicadas de este slug");
    }
    const currentRaw = await runtime.storage.getBytes(`pub/${pub.slug}/current.json`);
    const pointer = currentRaw != null ? (JSON.parse(new TextDecoder().decode(currentRaw)) as PublicationPointer) : null;
    if (pointer == null) throw badRequest("Falta el puntero de publicación");
    pointer.version = number;
    await runtime.storage.put(`pub/${pub.slug}/current.json`, JSON.stringify(pointer), { contentType: "application/json" });
    await runtime.kv.delete(`pub:${pub.slug}`);
    await db.update(publications).set({ versionId: row.id, publishedAt: nowMs(), publishedBy: auth.user.id }).where(eq(publications.projectId, access.project.id));
    await audit(c, "project.restore_version", "project", access.project.id, { version: number }, access.project.orgId);
    return c.json({ ok: true, version: number });
  });

  // ------- Export de parametros (el ZIP se arma en cliente §3.6) -------

  r.post("/:projectId/export", async (c) => {
    const auth = requireAuth(c);
    requireScope(auth, "projects:read");
    const db = c.get("db");
    const runtime = c.get("runtime");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const compiled = await compileProject(db, access.project.id, { sharedOrgIds: await templateOrgIds(db, c.get("config")) });
    const errors = compiled.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) throw badRequest("El tour tiene errores", { issues: errors });
    // Enumerar assets: claves directas + expansion de prefijos (tiles)
    const assetPaths: { rel: string; key: string }[] = Object.entries(compiled.assets).map(([rel, key]) => ({ rel, key }));
    for (const [relPrefix, storagePrefix] of Object.entries(compiled.prefixes)) {
      let cursor: string | undefined;
      for (;;) {
        const page = await runtime.storage.list(storagePrefix, { limit: 1000, cursor });
        for (const obj of page.objects) {
          assetPaths.push({ rel: `${relPrefix}${obj.key.slice(storagePrefix.length)}`, key: obj.key });
        }
        if (!page.truncated || page.cursor == null) break;
        cursor = page.cursor;
      }
    }
    await runtime.kv.put(
      `preview-map:${access.project.id}`,
      JSON.stringify({ assets: compiled.assets, prefixes: compiled.prefixes }),
      { ttlSeconds: 3600 },
    );
    return c.json({
      tour: compiled.tour,
      assets: assetPaths,
      warnings: compiled.issues.filter((i) => i.severity === "warning"),
    });
  });

  // ------- Portabilidad .andarama (§3.7) -------

  r.get("/:projectId/export.andarama", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const access = await projectAccess(db, c.req.param("projectId"), auth.user);
    const { scenes, hotspots, translations } = await import("@andarama/db");
    const { inArray } = await import("drizzle-orm");
    const sceneRows = await db.select().from(scenes).where(eq(scenes.projectId, access.project.id));
    const sceneIds = sceneRows.map((s) => s.id);
    const hotspotRows = sceneIds.length > 0 ? await db.select().from(hotspots).where(inArray(hotspots.sceneId, sceneIds)) : [];
    const translationRows = await db.select().from(translations).where(eq(translations.projectId, access.project.id));
    const doc = {
      format: "anda-project",
      version: 1,
      exportedAt: nowMs(),
      project: {
        title: access.project.title,
        slug: access.project.slug,
        settingsJson: access.project.settingsJson,
        tagsJson: access.project.tagsJson,
      },
      scenes: sceneRows,
      hotspots: hotspotRows,
      translations: translationRows,
    };
    return new Response(JSON.stringify(doc, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="${access.project.slug}.andarama"`,
      },
    });
  });

  r.post("/import.andarama", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const orgId = c.req.query("org");
    if (orgId == null) throw badRequest("Falta org");
    const { requireOrgRole } = await import("../lib/authz.js");
    await requireOrgRole(db, orgId, auth.user, "editor");
    const doc = z
      .object({
        format: z.literal("anda-project"),
        version: z.number(),
        project: z.object({ title: z.string(), settingsJson: z.string(), tagsJson: z.string().optional() }),
        scenes: z.array(z.record(z.unknown())),
        hotspots: z.array(z.record(z.unknown())),
        // Los documentos anteriores a la unificacion del grafo traen
        // conexiones sueltas: se aceptan y se ignoran.
        connections: z.array(z.record(z.unknown())).optional(),
        translations: z.array(z.record(z.unknown())),
      })
      .parse(await c.req.json());
    await assertTourQuota(db, c.get("config"), orgId);
    const projectId = newId();
    let slug = slugify(doc.project.title);
    const taken = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.orgId, orgId), eq(projects.slug, slug)))
      .limit(1);
    if (taken.length > 0) slug = `${slug}-${newId(6).toLowerCase()}`;
    await db.insert(projects).values({
      id: projectId,
      orgId,
      title: doc.project.title,
      slug,
      tagsJson: doc.project.tagsJson ?? "[]",
      settingsJson: doc.project.settingsJson,
      createdBy: auth.user.id,
      createdAt: nowMs(),
      updatedAt: nowMs(),
    });
    const { scenes, hotspots, translations } = await import("@andarama/db");
    const sceneIdMap = new Map<string, string>();
    for (const s of doc.scenes) sceneIdMap.set(s.id as string, newId());
    for (const s of doc.scenes) {
      await db.insert(scenes).values({ ...(s as typeof scenes.$inferInsert), id: sceneIdMap.get(s.id as string)!, projectId, mediaId: null, sourceJson: null });
    }
    const hsIdMap = new Map<string, string>();
    for (const h of doc.hotspots) hsIdMap.set(h.id as string, newId());
    for (const h of doc.hotspots) {
      const sceneId = sceneIdMap.get(h.sceneId as string);
      if (sceneId == null) continue;
      let content = String(h.contentJson ?? "{}");
      for (const [oldId, newSceneId] of sceneIdMap) content = content.replaceAll(`"${oldId}"`, `"${newSceneId}"`);
      await db.insert(hotspots).values({ ...(h as typeof hotspots.$inferInsert), id: hsIdMap.get(h.id as string)!, sceneId, contentJson: content });
    }
    for (const t of doc.translations) {
      const entityId =
        t.entity === "scene"
          ? sceneIdMap.get(t.entityId as string)
          : t.entity === "hotspot"
            ? hsIdMap.get(t.entityId as string)
            : (t.entityId as string);
      if (entityId == null) continue;
      await db.insert(translations).values({ ...(t as typeof translations.$inferInsert), id: newId(), projectId, entityId });
    }
    await audit(c, "project.import", "project", projectId, {}, orgId);
    return c.json({ id: projectId, slug, mediaNote: "Los medios no se incluyen en .andarama; vuelve a subirlos o sincroniza el almacenamiento" }, 201);
  });

  return r;
}

async function fireWebhooks(
  c: { get: (k: any) => any },
  orgId: string,
  projectId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = c.get("db");
  const runtime = c.get("runtime");
  const rows = await db.select().from(webhooks).where(eq(webhooks.active, true));
  const relevant = (rows as (typeof webhooks.$inferSelect)[]).filter(
    (w) =>
      (w.orgId == null || w.orgId === orgId) &&
      (w.projectId == null || w.projectId === projectId) &&
      parseJson<string[]>(w.eventsJson, []).includes(event),
  );
  for (const hook of relevant) {
    const body = JSON.stringify({ event, projectId, at: nowMs(), ...payload });
    runtime.deferred(
      (async () => {
        const signature = hook.secret != null ? await hmacSign(hook.secret, body) : undefined;
        await fetch(hook.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(signature != null ? { "x-anda-signature": signature } : {}),
          },
          body,
        }).catch((err) => console.error(`[webhook] ${hook.url} fallo:`, err));
      })(),
    );
  }
}

/**
 * Avisa por correo a los administradores de la instancia de que hay una ficha
 * de la galería esperando revisión. Sin transporte de correo configurado no
 * hace nada: la pestaña «Galería» del panel de administración sigue
 * enseñando las pendientes.
 */
async function notifyGalleryReview(
  c: { get: (k: any) => any },
  info: { slug: string; title: string; author: string },
): Promise<void> {
  const runtime = c.get("runtime");
  if (runtime.email?.configured !== true) return;
  const db = c.get("db");
  const admins = (await db.select({ email: users.email }).from(users).where(eq(users.roleGlobal, "admin"))) as { email: string }[];
  const base = c.get("config").publicUrl as string;
  for (const admin of admins) {
    await runtime.email
      .send({
        to: admin.email,
        subject: `Ficha pendiente en la galería: ${info.title}`,
        text:
          `${info.author} ha pedido una ficha en la galería pública para «${info.title}».\n\n` +
          `Recorrido: ${base}/t/${info.slug}\n` +
          `Revísala y apruébala o recházala en el panel de administración, pestaña «Galería»:\n${base}/studio/admin\n\n` +
          "Hasta que se apruebe, la ficha no aparece en /explorar/ ni en el sitemap.",
      })
      .catch((err: unknown) => console.warn("[galería] no se pudo avisar:", err instanceof Error ? err.message : String(err)));
  }
}

export type SlugCheck =
  | { status: "own" | "free" }
  | { status: "org" | "taken"; suggested: string };

/**
 * ¿Puede este proyecto publicar en esa dirección? «own»: ya es la suya;
 * «free»: libre; «org»: la usa otro recorrido de la misma organización;
 * «taken»: la usa otra organización. En los dos últimos casos se sugiere la
 * primera variante libre (-2, -3… y, si no, un sufijo aleatorio).
 */
export async function checkSlug(db: Db, slug: string, projectId: string, orgId: string): Promise<SlugCheck> {
  const owner = (await db.select().from(publications).where(eq(publications.slug, slug)).limit(1))[0];
  if (owner == null) return { status: "free" };
  if (owner.projectId === projectId) return { status: "own" };
  const ownerProject = (await db.select({ orgId: projects.orgId }).from(projects).where(eq(projects.id, owner.projectId)).limit(1))[0];
  const status = ownerProject?.orgId === orgId ? "org" : "taken";
  const base = slug.slice(0, 72).replace(/-+$/, "");
  for (let n = 2; n <= 9; n++) {
    const candidate = `${base}-${n}`;
    const used = (await db.select({ p: publications.projectId }).from(publications).where(eq(publications.slug, candidate)).limit(1))[0];
    if (used == null || used.p === projectId) return { status, suggested: candidate };
  }
  return { status, suggested: `${base}-${newId(6).toLowerCase()}` };
}

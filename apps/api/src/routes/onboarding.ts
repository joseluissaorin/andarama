import { Hono } from "hono";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { hotspots, media, orgMembers, projects, publications, scenes, users } from "@andarama/db";
import type { AppEnv } from "../lib/context.js";
import { requireAuth } from "../lib/session.js";
import { nowMs, parseJson } from "../lib/util.js";

/**
 * Lista de primeros pasos del tablero y del editor: subir una foto 360,
 * añadir un punto, publicar y compartir.
 *
 * Tres pasos se deducen de lo que la persona ya ha hecho (así el progreso
 * sobrevive a cualquier navegador); compartir no deja rastro en la base de
 * datos y se apunta a mano en las preferencias de la cuenta, igual que
 * haberla cerrado. El tour de ejemplo no cuenta: está hecho de antemano.
 */

export const ONBOARDING_STEPS = ["upload", "hotspot", "publish", "share"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

interface OnboardingPrefs {
  /** Pasos marcados a mano, con la fecha en que se hicieron. */
  done?: Partial<Record<OnboardingStep, number>>;
  dismissed?: number;
}

export function onboardingRoutes(): Hono<AppEnv> {
  const r = new Hono<AppEnv>();

  r.get("/", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const prefs = parseJson<{ onboarding?: OnboardingPrefs }>(auth.user.prefsJson, {}).onboarding ?? {};
    const orgIds = (await db.select({ orgId: orgMembers.orgId }).from(orgMembers).where(eq(orgMembers.userId, auth.user.id))).map(
      (m) => m.orgId,
    );

    // Una foto 360 propia (los medios del ejemplo son de la organización Plantillas)
    const upload =
      orgIds.length > 0 &&
      (await db
        .select({ id: media.id })
        .from(media)
        .where(and(inArray(media.orgId, orgIds), eq(media.kind, "panorama"), isNull(media.deletedAt)))
        .limit(1)).length > 0;

    // Un punto en cualquier tour que no sea el de ejemplo
    const own = orgIds.length > 0
      ? await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(inArray(projects.orgId, orgIds), eq(projects.isSample, false), isNull(projects.deletedAt)))
      : [];
    const ownIds = own.map((p) => p.id);
    const hotspot =
      ownIds.length > 0 &&
      (await db
        .select({ id: hotspots.id })
        .from(hotspots)
        .innerJoin(scenes, eq(hotspots.sceneId, scenes.id))
        .where(inArray(scenes.projectId, ownIds))
        .limit(1)).length > 0;

    // Publicado por esta persona, fuera del ejemplo
    const publish =
      ownIds.length > 0 &&
      (await db
        .select({ id: publications.projectId })
        .from(publications)
        .where(and(inArray(publications.projectId, ownIds), eq(publications.publishedBy, auth.user.id)))
        .limit(1)).length > 0;

    const done = prefs.done ?? {};
    const steps: Record<OnboardingStep, boolean> = {
      upload: upload || done.upload != null,
      hotspot: hotspot || done.hotspot != null,
      publish: publish || done.publish != null,
      share: done.share != null,
    };

    const sample = orgIds.length > 0
      ? (await db
          .select({ id: projects.id })
          .from(projects)
          .where(and(inArray(projects.orgId, orgIds), eq(projects.isSample, true), isNull(projects.deletedAt)))
          .limit(1))[0]
      : undefined;

    return c.json({
      steps,
      completed: ONBOARDING_STEPS.every((s) => steps[s]),
      dismissed: prefs.dismissed != null,
      /** Sin fotos 360 propias: el Studio ofrece la herramienta gratuita. */
      hasPhotos: upload,
      sampleProjectId: sample?.id ?? null,
    });
  });

  /** Marca un paso como hecho o cierra la lista. */
  r.post("/", async (c) => {
    const auth = requireAuth(c);
    const db = c.get("db");
    const body = z
      .object({ step: z.enum(ONBOARDING_STEPS).optional(), dismissed: z.boolean().optional() })
      .parse(await c.req.json().catch(() => ({})));
    const all = parseJson<Record<string, unknown>>(auth.user.prefsJson, {});
    const current = (all.onboarding as OnboardingPrefs | undefined) ?? {};
    const next: OnboardingPrefs = { ...current, done: { ...current.done } };
    if (body.step != null && next.done![body.step] == null) next.done![body.step] = nowMs();
    if (body.dismissed === true) next.dismissed = nowMs();
    if (body.dismissed === false) delete next.dismissed;
    await db
      .update(users)
      .set({ prefsJson: JSON.stringify({ ...all, onboarding: next }), updatedAt: nowMs() })
      .where(eq(users.id, auth.user.id));
    return c.json({ ok: true });
  });

  return r;
}

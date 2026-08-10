import { and, eq, gte, lte, sql } from "drizzle-orm";
import { analyticsEvents } from "@andarama/db";
import type { AnalyticsAdapter, AnalyticsEvent, AnalyticsSummary } from "../types.js";

/**
 * Analitica sobre una tabla SQLite (drizzle). Es la implementacion self-host
 * y tambien el fallback D1 en Cloudflare cuando no se configura Workers
 * Analytics Engine. Sin cookies: sessionHash es un hash diario anonimo.
 */
export function createSqlAnalytics(db: unknown): AnalyticsAdapter {
  const d = db as any;
  return {
    async write(event: AnalyticsEvent): Promise<void> {
      await d.insert(analyticsEvents).values({
        ts: Date.now(),
        tourSlug: event.tourSlug,
        event: event.event,
        sceneId: event.sceneId ?? null,
        hotspotId: event.hotspotId ?? null,
        lang: event.lang ?? null,
        device: event.device ?? null,
        country: event.country ?? null,
        refererHost: event.refererHost ?? null,
        sessionHash: event.sessionHash ?? null,
        durationMs: event.durationMs ?? null,
        yawBucket: event.yawBucket ?? null,
        pitchBucket: event.pitchBucket ?? null,
      });
    },

    async query(tourSlug: string, opts: { from: number; to: number }): Promise<AnalyticsSummary> {
      const range = and(
        eq(analyticsEvents.tourSlug, tourSlug),
        gte(analyticsEvents.ts, opts.from),
        lte(analyticsEvents.ts, opts.to),
      );
      const countCol = sql<number>`count(*)`.as("c");

      const visitsRows = await d
        .select({ c: countCol })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")));
      const uniqueRows = await d
        .select({ c: sql<number>`count(distinct ${analyticsEvents.sessionHash})`.as("c") })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")));

      const sceneViews = await d
        .select({
          sceneId: analyticsEvents.sceneId,
          views: sql<number>`sum(case when ${analyticsEvents.event} = 'scene' then 1 else 0 end)`.as("v"),
          avgDurationMs: sql<number>`coalesce(avg(case when ${analyticsEvents.event} = 'duration' then ${analyticsEvents.durationMs} end), 0)`.as("adm"),
        })
        .from(analyticsEvents)
        .where(range)
        .groupBy(analyticsEvents.sceneId);

      const hotspotClicks = await d
        .select({
          sceneId: analyticsEvents.sceneId,
          hotspotId: analyticsEvents.hotspotId,
          clicks: countCol,
        })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "hotspot")))
        .groupBy(analyticsEvents.sceneId, analyticsEvents.hotspotId);

      const devices = await d
        .select({ device: analyticsEvents.device, count: countCol })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")))
        .groupBy(analyticsEvents.device);

      const countries = await d
        .select({ country: analyticsEvents.country, count: countCol })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")))
        .groupBy(analyticsEvents.country);

      const referers = await d
        .select({ host: analyticsEvents.refererHost, count: countCol })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")))
        .groupBy(analyticsEvents.refererHost);

      const languages = await d
        .select({ lang: analyticsEvents.lang, count: countCol })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")))
        .groupBy(analyticsEvents.lang);

      const heatmap = await d
        .select({
          sceneId: analyticsEvents.sceneId,
          yawBucket: analyticsEvents.yawBucket,
          pitchBucket: analyticsEvents.pitchBucket,
          count: countCol,
        })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "heartbeat")))
        .groupBy(analyticsEvents.sceneId, analyticsEvents.yawBucket, analyticsEvents.pitchBucket);

      const timeseries = await d
        .select({
          day: sql<string>`date(${analyticsEvents.ts} / 1000, 'unixepoch')`.as("day"),
          visits: countCol,
        })
        .from(analyticsEvents)
        .where(and(range, eq(analyticsEvents.event, "view")))
        .groupBy(sql`day`);

      const clean = <T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] =>
        (rows as T[]).filter((r) => keys.every((k) => r[k] != null));

      return {
        visits: Number((visitsRows as { c: number }[])[0]?.c ?? 0),
        uniqueSessions: Number((uniqueRows as { c: number }[])[0]?.c ?? 0),
        sceneViews: clean(sceneViews as any[], ["sceneId"]) as AnalyticsSummary["sceneViews"],
        hotspotClicks: clean(hotspotClicks as any[], ["sceneId", "hotspotId"]) as AnalyticsSummary["hotspotClicks"],
        devices: clean(devices as any[], ["device"]) as AnalyticsSummary["devices"],
        countries: clean(countries as any[], ["country"]) as AnalyticsSummary["countries"],
        referers: clean(referers as any[], ["host"]) as AnalyticsSummary["referers"],
        languages: clean(languages as any[], ["lang"]) as AnalyticsSummary["languages"],
        heatmap: clean(heatmap as any[], ["sceneId", "yawBucket", "pitchBucket"]) as AnalyticsSummary["heatmap"],
        timeseries: timeseries as AnalyticsSummary["timeseries"],
      };
    },
  };
}

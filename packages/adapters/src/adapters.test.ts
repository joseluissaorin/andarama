import { describe, expect, it } from "vitest";
import { pbkdf2Hash, pbkdf2Verify } from "./shared/pbkdf2.js";
import { hmacSign, hmacVerify, signUploadUrl, verifyUploadUrl } from "./shared/hmac.js";
import { createArgon2Hasher, createInProcessQueue, createSqliteDb, createSqliteKv, migrateSqlite } from "./node/index.js";
import { createSqlAnalytics } from "./shared/analytics-sql.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../db/migrations");

describe("pbkdf2", () => {
  it("hash y verify", async () => {
    const hash = await pbkdf2Hash("secreto123", 1000);
    expect(hash.startsWith("$pbkdf2-sha256$")).toBe(true);
    expect(await pbkdf2Verify("secreto123", hash)).toBe(true);
    expect(await pbkdf2Verify("otro", hash)).toBe(false);
  });
});

describe("argon2id (self-host)", () => {
  it("hash y verify, y verifica tambien pbkdf2", async () => {
    const hasher = createArgon2Hasher();
    const hash = await hasher.hash("secreto123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await hasher.verify("secreto123", hash)).toBe(true);
    expect(await hasher.verify("otro", hash)).toBe(false);
    const pb = await pbkdf2Hash("cruzado", 1000);
    expect(await hasher.verify("cruzado", pb)).toBe(true);
  });
});

describe("hmac upload urls", () => {
  it("firma y verifica", async () => {
    expect(await hmacVerify("s", "payload", await hmacSign("s", "payload"))).toBe(true);
    expect(await hmacVerify("s", "payload", await hmacSign("otro", "payload"))).toBe(false);
    const url = await signUploadUrl("secreto", "http://localhost", "media/x.jpg", { part: 2, uploadId: "u1" });
    const parsed = await verifyUploadUrl("secreto", new URL(url).searchParams);
    expect(parsed).toEqual({ key: "media/x.jpg", part: 2, uploadId: "u1" });
    const bad = new URL(url);
    bad.searchParams.set("key", "otra.jpg");
    expect(await verifyUploadUrl("secreto", bad.searchParams)).toBeNull();
  });
});

describe("sqlite: migraciones, kv y analitica", () => {
  it("migra, kv con ttl y analitica agregada", async () => {
    const { db, sqlite } = await createSqliteDb(":memory:");
    const applied = await migrateSqlite(sqlite, migrationsDir);
    expect(applied).toContain("0001_init.sql");
    expect(await migrateSqlite(sqlite, migrationsDir)).toEqual([]);

    const kv = createSqliteKv(sqlite);
    await kv.put("a", "1");
    expect(await kv.get("a")).toBe("1");
    await kv.put("b", "2", { ttlSeconds: -1 });
    expect(await kv.get("b")).toBeNull();
    await kv.delete("a");
    expect(await kv.get("a")).toBeNull();

    const analytics = createSqlAnalytics(db);
    await analytics.write({ tourSlug: "demo", event: "view", device: "desktop", sessionHash: "s1", lang: "es" });
    await analytics.write({ tourSlug: "demo", event: "view", device: "mobile", sessionHash: "s2", lang: "en" });
    await analytics.write({ tourSlug: "demo", event: "scene", sceneId: "entrada", sessionHash: "s1" });
    await analytics.write({ tourSlug: "demo", event: "hotspot", sceneId: "entrada", hotspotId: "h1" });
    await analytics.write({ tourSlug: "demo", event: "heartbeat", sceneId: "entrada", yawBucket: 3, pitchBucket: 1 });
    await analytics.write({ tourSlug: "otro", event: "view", sessionHash: "s9" });

    const summary = await analytics.query("demo", { from: 0, to: Date.now() + 1000 });
    expect(summary.visits).toBe(2);
    expect(summary.uniqueSessions).toBe(2);
    expect(summary.sceneViews.find((s) => s.sceneId === "entrada")?.views).toBe(1);
    expect(summary.hotspotClicks[0]).toMatchObject({ sceneId: "entrada", hotspotId: "h1", clicks: 1 });
    expect(summary.heatmap[0]).toMatchObject({ sceneId: "entrada", yawBucket: 3, pitchBucket: 1, count: 1 });
    expect(summary.devices.length).toBe(2);
  });
});

describe("cola en proceso", () => {
  it("procesa trabajos en orden", async () => {
    const queue = createInProcessQueue();
    const seen: string[] = [];
    queue.start(async (msg) => {
      seen.push(msg.id);
    });
    await queue.enqueue({ id: "1", kind: "tile", payload: {}, orgId: "o" });
    await queue.enqueue({ id: "2", kind: "tile", payload: {}, orgId: "o" });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen).toEqual(["1", "2"]);
  });
});

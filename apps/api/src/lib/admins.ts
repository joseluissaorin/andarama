import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { users } from "@andarama/db";
import type { AppConfig, AppEnv, UserRow } from "./context.js";
import { audit } from "./helpers.js";
import { nowMs } from "./util.js";

/**
 * Quién administra la instancia.
 *
 * Con `ADMIN_EMAILS` definida manda la lista: solo esas direcciones son
 * administradoras al darse de alta o al iniciar sesión, y nadie más se
 * promueve solo. Sin la lista, en una autoinstalación sin Clerk se conserva
 * la costumbre de siempre (el primer usuario administra); con Clerk y sin
 * lista nadie se hace administrador automáticamente.
 */

/** Traduce `ADMIN_EMAILS` (separada por comas) a una lista en minúsculas; undefined si no está. */
export function parseAdminEmails(raw: string | undefined | null): string[] | undefined {
  if (raw == null) return undefined;
  const list = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
  return list.length > 0 ? list : undefined;
}

/** ¿Está la dirección en la lista blanca? */
export function isListedAdmin(config: AppConfig, email: string): boolean {
  return config.adminEmails != null && config.adminEmails.includes(email.trim().toLowerCase());
}

/** ¿Hereda el primer usuario el papel de administrador? Solo en autoinstalación sin lista ni Clerk. */
export function firstUserIsAdmin(config: AppConfig): boolean {
  return config.adminEmails == null && config.clerk == null;
}

/** Rol global con el que nace una cuenta nueva. */
export function initialRole(config: AppConfig, email: string, isFirstUser: boolean): "admin" | "user" {
  if (config.adminEmails != null) return isListedAdmin(config, email) ? "admin" : "user";
  return isFirstUser && firstUserIsAdmin(config) ? "admin" : "user";
}

/**
 * Al iniciar sesión: quien está en la lista y aún no administra se promueve,
 * y queda auditado. Devuelve la fila actualizada.
 */
export async function promoteListedAdmin(c: Context<AppEnv>, user: UserRow, via: string): Promise<UserRow> {
  const config = c.get("config");
  if (user.roleGlobal === "admin" || !isListedAdmin(config, user.email)) return user;
  await c.get("db").update(users).set({ roleGlobal: "admin", updatedAt: nowMs() }).where(eq(users.id, user.id));
  await audit(c, "admin.role_change", "user", user.id, { from: user.roleGlobal, to: "admin", via, reason: "ADMIN_EMAILS" }, undefined, user.id);
  return { ...user, roleGlobal: "admin" };
}

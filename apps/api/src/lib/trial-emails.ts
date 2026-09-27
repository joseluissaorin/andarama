import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { trialEmails, users } from "@andarama/db";
import type { EmailAdapter } from "@andarama/adapters";
import type { Db } from "./context.js";
import { TRIAL_MS } from "./plans.js";
import { nowMs, parseJson, sha256Hex } from "./util.js";

/**
 * Correos del ciclo de la prueba de 14 días, enviados por el cron diario.
 *
 * Cuatro pasos, cada uno con su ventana para que nadie reciba un correo a
 * destiempo (por ejemplo, la bienvenida a quien lleva diez días probando):
 *
 * - bienvenida: días 0 a 2 de la prueba.
 * - dia7: días 7 a 10.
 * - dia12: desde el día 12 hasta que acaba la prueba.
 * - final: los tres días siguientes al final.
 *
 * Solo para quien sigue sin plan de pago ni plan concedido, no administra la
 * instancia y no ha pedido la baja. Lo que se promete es lo que hace el
 * producto al acabar la prueba: el recorrido publicado sigue en línea con la
 * insignia, editar y publicar piden un plan y exportar sigue libre.
 */

export type TrialStep = "bienvenida" | "dia7" | "dia12" | "final";

const DAY = 24 * 60 * 60 * 1000;

/** Paso que toca a una prueba en este momento, o null. */
export function stepFor(trialEndsAt: number, now: number): TrialStep | null {
  const start = trialEndsAt - TRIAL_MS;
  const day = (now - start) / DAY;
  if (now >= trialEndsAt) return now < trialEndsAt + 3 * DAY ? "final" : null;
  if (day >= 12) return "dia12";
  if (day >= 7 && day < 10) return "dia7";
  if (day >= 0 && day < 2) return "bienvenida";
  return null;
}

/** Firma del enlace de baja: no hace falta sesión para darse de baja. */
export async function unsubscribeToken(secret: string, userId: string): Promise<string> {
  return (await sha256Hex(`${secret}:trial-unsubscribe:${userId}`)).slice(0, 32);
}

type Lang = "es" | "en";

function fecha(ms: number, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long" }).format(new Date(ms));
}

export function composeTrialEmail(
  step: TrialStep,
  opts: { name: string; lang: Lang; trialEndsAt: number; studioUrl: string; unsubscribeUrl: string; sampleTour?: boolean },
): { subject: string; text: string } {
  const { name, lang, trialEndsAt, studioUrl, unsubscribeUrl } = opts;
  const ejemplo =
    opts.sampleTour === true
      ? lang === "es"
        ? "En tu cuenta hay un recorrido de ejemplo para tocarlo todo sin miedo, y una lista de primeros pasos"
        : "Your account includes a sample tour to play with, and a first-steps list"
      : lang === "es"
        ? "En el Studio tienes una lista de primeros pasos"
        : "The Studio has a first-steps list";
  const precios = lang === "es" ? "https://andarama.com/precios/" : "https://andarama.com/en/pricing/";
  const ayuda = lang === "es" ? "https://docs.andarama.com/docs/usuario/primeros-pasos/" : "https://docs.andarama.com/docs/en/usuario/primeros-pasos/";
  const fin = fecha(trialEndsAt, lang);
  const saludo = lang === "es" ? `Hola, ${name}:` : `Hi ${name},`;
  const firma =
    lang === "es"
      ? `Un saludo,\nJosé Luis Saorín, Andarama\n\nSi no quieres recibir más avisos sobre la prueba: ${unsubscribeUrl}`
      : `Best wishes,\nJosé Luis Saorín, Andarama\n\nTo stop receiving trial reminders: ${unsubscribeUrl}`;
  const cuerpo: Record<TrialStep, { es: [string, string]; en: [string, string] }> = {
    bienvenida: {
      es: [
        "Tu prueba de Andarama ya está en marcha",
        `Tienes catorce días, hasta el ${fin}, para crear y publicar un recorrido 360 sin tarjeta.\n\n${ejemplo}: subir una foto 360, añadir un punto, publicar y compartir. Si todavía no tienes fotos 360, en el Studio encontrarás de dónde sacarlas.\n\nEmpieza aquí: ${studioUrl}\nGuía de primeros pasos: ${ayuda}\n\nSi algo no funciona o no se entiende, responde a este correo: lo leo yo.`,
      ],
      en: [
        "Your Andarama trial has started",
        `You have fourteen days, until ${fin}, to create and publish a 360° tour with no card.\n\n${ejemplo}: upload a 360° photo, add a hotspot, publish and share.\n\nStart here: ${studioUrl}\nGetting started guide: ${ayuda}\n\nIf anything breaks or is unclear, just reply to this email: I read every one.`,
      ],
    },
    dia7: {
      es: [
        "Mitad de la prueba: lo que suelen hacer quienes se quedan",
        `Vas por la mitad de la prueba, que termina el ${fin}.\n\nQuienes sacan partido a Andarama suelen dar uno de estos pasos en la primera semana:\n\n- Publicar el recorrido y pegarlo en su web, en WordPress o en Moodle (el código de inserción está en «Compartir»).\n- Añadir un quiz con nota o un escape room con compuertas, si es para clase.\n- Exportarlo como paquete SCORM para el aula virtual, en el plan Formación.\n\nTu recorrido: ${studioUrl}\n\n¿Hay algo que te frene? Responde a este correo y lo miramos.`,
      ],
      en: [
        "Halfway through your trial",
        `You are halfway through your trial, which ends on ${fin}.\n\nPeople who get the most out of Andarama usually do one of these in their first week:\n\n- Publish the tour and embed it on their website, in WordPress or in Moodle (the embed code is under "Share").\n- Add a graded quiz or an escape room with gates, if it is for a class.\n- Export it as a SCORM package for their LMS, on the Formación plan.\n\nYour tour: ${studioUrl}\n\nIs anything holding you back? Reply to this email and we will look at it.`,
      ],
    },
    dia12: {
      es: [
        `Tu prueba termina el ${fin}`,
        `Tu prueba de Andarama termina el ${fin}. Esto es lo que pasa entonces:\n\n- Tus recorridos publicados siguen en línea, con la insignia «Hecho con Andarama».\n- Para editar, volver a publicar o subir fotos nuevas hace falta un plan.\n- Exportar sigue siendo libre: tus recorridos son tuyos.\n\nLos planes empiezan en 2 $ al mes; el plan Paseo (20 $ al mes o 200 $ al año) incluye diez recorridos, y Aula cuesta 42 $ al año por docente. Todos los precios: ${precios}\n\nElige tu plan desde el Studio: ${studioUrl}`,
      ],
      en: [
        `Your trial ends on ${fin}`,
        `Your Andarama trial ends on ${fin}. Here is what happens then:\n\n- Your published tours stay online, with the "Made with Andarama" badge.\n- Editing, republishing and uploading new photos require a plan.\n- Exporting stays free: your tours are yours.\n\nPlans start at $2 a month; Paseo ($20 a month or $200 a year) includes ten tours, and Aula is $42 a year per teacher. All prices: ${precios}\n\nChoose your plan from the Studio: ${studioUrl}`,
      ],
    },
    final: {
      es: [
        "Tu prueba de Andarama ha terminado",
        `Tu prueba terminó el ${fin}. Tus recorridos publicados siguen en línea con la insignia y puedes exportarlos cuando quieras.\n\nPara seguir editando y publicando, elige un plan: ${studioUrl}\nPrecios: ${precios}\n\nSi eres de un centro educativo, un museo o una empresa y necesitas factura en euros, responde a este correo y te preparo un presupuesto.`,
      ],
      en: [
        "Your Andarama trial has ended",
        `Your trial ended on ${fin}. Your published tours stay online with the badge, and you can export them whenever you want.\n\nTo keep editing and publishing, choose a plan: ${studioUrl}\nPrices: ${precios}\n\nIf you are a school, a museum or a company and need an invoice in euros, reply to this email and I will send you a quote.`,
      ],
    },
  };
  const [subject, body] = cuerpo[step][lang];
  return { subject, text: `${saludo}\n\n${body}\n\n${firma}` };
}

/**
 * Recorre las pruebas vivas o recién acabadas y envía el paso que toque.
 * Devuelve cuántos correos se han enviado. Sin transporte de correo no hace
 * nada (no marca los pasos como enviados, para que salgan cuando lo haya).
 */
export async function sendTrialEmails(
  db: Db,
  email: EmailAdapter,
  opts: { secret: string; apiUrl: string; studioUrl: string; sampleTour?: boolean },
  now = nowMs(),
): Promise<number> {
  if (!email.configured) return 0;
  const candidatos = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      prefsJson: users.prefsJson,
      trialEndsAt: users.trialEndsAt,
    })
    .from(users)
    .where(and(isNotNull(users.trialEndsAt), isNull(users.plan), isNull(users.planOverride), eq(users.roleGlobal, "user")));
  let enviados = 0;
  for (const u of candidatos) {
    const step = stepFor(u.trialEndsAt!, now);
    if (step == null) continue;
    const hechos = await db.select({ step: trialEmails.step }).from(trialEmails).where(eq(trialEmails.userId, u.id));
    const pasos = new Set(hechos.map((h) => h.step));
    if (pasos.has("baja") || pasos.has(step)) continue;
    const prefs = parseJson<{ lang?: string }>(u.prefsJson, {});
    const lang: Lang = prefs.lang == null || prefs.lang.startsWith("es") ? "es" : "en";
    const token = await unsubscribeToken(opts.secret, u.id);
    const unsubscribeUrl = `${opts.apiUrl}/api/v1/public/trial-emails/unsubscribe?u=${encodeURIComponent(u.id)}&t=${token}`;
    const nombre = u.name.trim().split(/\s+/)[0] || u.name;
    const msg = composeTrialEmail(step, { name: nombre, lang, trialEndsAt: u.trialEndsAt!, studioUrl: opts.studioUrl, unsubscribeUrl, sampleTour: opts.sampleTour });
    try {
      await email.send({ to: u.email, subject: msg.subject, text: msg.text });
      await db.insert(trialEmails).values({ userId: u.id, step, sentAt: now }).onConflictDoNothing();
      enviados++;
    } catch (err) {
      console.warn(`[prueba] no se pudo enviar ${step} a ${u.id}:`, err instanceof Error ? err.message : String(err));
    }
  }
  return enviados;
}

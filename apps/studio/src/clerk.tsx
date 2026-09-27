import { useEffect, useLayoutEffect, useState } from "react";
import { ClerkLoaded, ClerkLoading, ClerkProvider, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { esES } from "@clerk/localizations";
import type { UiLang } from "@andarama/schema";

type ClerkLocalization = typeof esES;

/**
 * Los formularios de Clerk en el idioma del Studio. Español va en el bundle;
 * el resto se pide a @clerk/localizations por idioma y solo al elegirlo.
 * Inglés y filipino (que Clerk no trae) usan el inglés de serie.
 */
const CLERK_LOCALES: Partial<Record<UiLang, () => Promise<ClerkLocalization>>> = {
  es: () => Promise.resolve(esES),
  ar: () => import("@clerk/localizations/ar-SA").then((m) => m.arSA),
  cs: () => import("@clerk/localizations/cs-CZ").then((m) => m.csCZ),
  da: () => import("@clerk/localizations/da-DK").then((m) => m.daDK),
  de: () => import("@clerk/localizations/de-DE").then((m) => m.deDE),
  el: () => import("@clerk/localizations/el-GR").then((m) => m.elGR),
  fi: () => import("@clerk/localizations/fi-FI").then((m) => m.fiFI),
  fr: () => import("@clerk/localizations/fr-FR").then((m) => m.frFR),
  he: () => import("@clerk/localizations/he-IL").then((m) => m.heIL),
  hr: () => import("@clerk/localizations/hr-HR").then((m) => m.hrHR),
  hu: () => import("@clerk/localizations/hu-HU").then((m) => m.huHU),
  id: () => import("@clerk/localizations/id-ID").then((m) => m.idID),
  it: () => import("@clerk/localizations/it-IT").then((m) => m.itIT),
  ja: () => import("@clerk/localizations/ja-JP").then((m) => m.jaJP),
  ko: () => import("@clerk/localizations/ko-KR").then((m) => m.koKR),
  ms: () => import("@clerk/localizations/ms-MY").then((m) => m.msMY),
  nl: () => import("@clerk/localizations/nl-NL").then((m) => m.nlNL),
  no: () => import("@clerk/localizations/nb-NO").then((m) => m.nbNO),
  pl: () => import("@clerk/localizations/pl-PL").then((m) => m.plPL),
  pt: () => import("@clerk/localizations/pt-PT").then((m) => m.ptPT),
  ro: () => import("@clerk/localizations/ro-RO").then((m) => m.roRO),
  ru: () => import("@clerk/localizations/ru-RU").then((m) => m.ruRU),
  sk: () => import("@clerk/localizations/sk-SK").then((m) => m.skSK),
  sv: () => import("@clerk/localizations/sv-SE").then((m) => m.svSE),
  th: () => import("@clerk/localizations/th-TH").then((m) => m.thTH),
  tr: () => import("@clerk/localizations/tr-TR").then((m) => m.trTR),
  uk: () => import("@clerk/localizations/uk-UA").then((m) => m.ukUA),
  vi: () => import("@clerk/localizations/vi-VN").then((m) => m.viVN),
  "zh-Hans": () => import("@clerk/localizations/zh-CN").then((m) => m.zhCN),
  "zh-Hant": () => import("@clerk/localizations/zh-TW").then((m) => m.zhTW),
};
import { setAuthTokenProvider } from "./api";
import { useI18nStore, useT } from "./i18n";
import { Criatura } from "./components/Criatura";

/**
 * Clerk en el Studio.
 *
 * La instancia dice al arrancar qué puerta usa (`/api/v1/config`). Con
 * Clerk, el Studio se envuelve en su proveedor, los formularios de acceso
 * son los de Clerk y el token de sesión viaja en cada petición a la API.
 * Sin Clerk (self-host) nada de este fichero se monta: las cuentas propias
 * siguen como siempre.
 */

export interface InstanceConfig {
  auth: "clerk" | "local";
  clerkPublishableKey: string | null;
  sso: boolean;
  platform: string;
}

let instanceConfig: InstanceConfig = { auth: "local", clerkPublishableKey: null, sso: false, platform: "" };

export async function loadInstanceConfig(): Promise<InstanceConfig> {
  try {
    const res = await fetch("/api/v1/config", { credentials: "same-origin" });
    if (res.ok) instanceConfig = (await res.json()) as InstanceConfig;
  } catch {
    // sin API a mano: se asume el modo local
  }
  return instanceConfig;
}

export function getInstanceConfig(): InstanceConfig {
  return instanceConfig;
}

export function isClerkMode(): boolean {
  return instanceConfig.auth === "clerk" && instanceConfig.clerkPublishableKey != null;
}

/** Prefijo de rutas del Studio: "" en app.andarama.com, "/studio" en el resto. */
export function studioPrefix(): string {
  return location.pathname === "/studio" || location.pathname.startsWith("/studio/") ? "/studio" : "";
}

interface ClerkHandle {
  /** Clerk tiene sesión activa (aunque la API aún no la haya aceptado). */
  isSignedIn: () => boolean;
  signOut: () => Promise<void>;
  openUserProfile: () => void;
  /** Fuerza un token nuevo (tras cambiar de plan, para no esperar al refresco). */
  refreshToken: () => Promise<void>;
}

let clerkHandle: ClerkHandle | null = null;

export function getClerk(): ClerkHandle | null {
  return clerkHandle;
}

/** Registra el proveedor de tokens y el asa de Clerk mientras hay proveedor. */
function ClerkBridge({ children }: { children: React.ReactNode }): React.ReactNode {
  const { getToken } = useClerkAuth();
  const clerk = useClerk();
  useLayoutEffect(() => {
    setAuthTokenProvider(() => getToken());
    clerkHandle = {
      isSignedIn: () => clerk.session != null,
      signOut: () => clerk.signOut({ redirectUrl: `${studioPrefix()}/login` }),
      openUserProfile: () => clerk.openUserProfile(),
      refreshToken: async () => {
        await clerk.session?.getToken({ skipCache: true });
      },
    };
    return () => {
      setAuthTokenProvider(null);
      clerkHandle = null;
    };
  }, [getToken, clerk]);
  return children;
}

function Cargando(): React.ReactNode {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <Criatura size={64} andando />
      <p className="text-[13px] font-medium text-[var(--anda-text-dim)]">{t("loading")}</p>
    </div>
  );
}

/** El proveedor de Clerk con la ropa de Andarama y en el idioma del Studio. */
export function AndaClerkProvider({ children }: { children: React.ReactNode }): React.ReactNode {
  const lang = useI18nStore((s) => s.lang);
  const [localization, setLocalization] = useState<ClerkLocalization | undefined>(lang === "es" ? esES : undefined);
  useEffect(() => {
    let vigente = true;
    const cargar = CLERK_LOCALES[lang];
    if (cargar == null) {
      setLocalization(undefined);
      return;
    }
    void cargar()
      .then((l) => {
        if (vigente) setLocalization(l);
      })
      .catch(() => {
        if (vigente) setLocalization(undefined);
      });
    return () => {
      vigente = false;
    };
  }, [lang]);
  return (
    <ClerkProvider
      publishableKey={instanceConfig.clerkPublishableKey ?? ""}
      localization={localization}
      afterSignOutUrl={`${studioPrefix()}/login`}
      signInUrl={`${studioPrefix()}/login`}
      signUpUrl={`${studioPrefix()}/register`}
      appearance={{
        variables: {
          colorPrimary: "#ff8a00",
          colorBackground: "#fffdf8",
          borderRadius: "12px",
          fontFamily: "inherit",
        },
        elements: {
          card: { boxShadow: "none", border: "1px solid #e8ddc4" },
          formButtonPrimary: { boxShadow: "0 3px 0 #e8501a", fontWeight: 700 },
        },
      }}
    >
      <ClerkLoading>
        <Cargando />
      </ClerkLoading>
      <ClerkLoaded>
        <ClerkBridge>{children}</ClerkBridge>
      </ClerkLoaded>
    </ClerkProvider>
  );
}

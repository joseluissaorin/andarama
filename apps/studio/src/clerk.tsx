import { useLayoutEffect } from "react";
import { ClerkLoaded, ClerkLoading, ClerkProvider, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { esES } from "@clerk/localizations";
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
  return (
    <ClerkProvider
      publishableKey={instanceConfig.clerkPublishableKey ?? ""}
      localization={lang === "es" ? esES : undefined}
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

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  redirect,
  RouterProvider,
} from "@tanstack/react-router";
import { ToastProvider, UiTextProvider } from "@andarama/ui";
import { useT } from "./i18n";
import "./index.css";
import { Shell } from "./components/Shell";
import { setupPwa } from "./pwa";
import { UpdateBanner } from "./components/UpdateBanner";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { OrgDefaultsPage } from "./pages/OrgDefaultsPage";
import { MediaPage } from "./pages/MediaPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { TeamPage } from "./pages/TeamPage";
import { useAuth } from "./stores";
import { PlanPage } from "./pages/PlanPage";
import { AndaClerkProvider, isClerkMode, loadInstanceConfig } from "./clerk";
import { captureAttributionFromBrowser } from "./attribution";
import { rememberPlanIntent } from "./intent";
import { EditorPage } from "./editor/EditorPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } },
});

/** Textos del sistema de diseño (el icono de ayuda) en el idioma del Studio. */
function UiTexts({ children }: { children: React.ReactNode }): React.ReactNode {
  const t = useT();
  return <UiTextProvider moreInfo={t("help_more_info")}>{children}</UiTextProvider>;
}

const rootRoute = createRootRoute({
  component: () => (
    <ToastProvider>
      <UiTexts>
        <Outlet />
        <UpdateBanner />
      </UiTexts>
    </ToastProvider>
  ),
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: Shell,
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/",
  component: ProjectsPage,
});

const mediaRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/media",
  component: MediaPage,
});

const orgDefaultsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/org",
  component: OrgDefaultsPage,
});

const accountRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/account",
  component: AccountPage,
});

const teamRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/team",
  component: TeamPage,
});

const isInstanceAdmin = (): boolean => useAuth.getState().me?.user?.roleGlobal === "admin";

/**
 * La administración de la instancia, solo para quien la administra. La API ya
 * lo exige; esto evita enseñar una página rota a quien llega por URL. Si la
 * sesión aún no se ha cargado (entrada directa), decide el propio componente
 * en cuanto la Shell la tiene.
 */
function AdminGuard(): React.ReactNode {
  const roleGlobal = useAuth((s) => s.me?.user?.roleGlobal);
  if (roleGlobal !== "admin") return <Navigate to="/" />;
  return <AdminPage />;
}

const adminRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/admin",
  beforeLoad: () => {
    const { loaded, me } = useAuth.getState();
    if (loaded && me?.user != null && !isInstanceAdmin()) throw redirect({ to: "/" });
  },
  component: AdminGuard,
});

const planRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/plan",
  component: PlanPage,
  // `?plan=paseo`: la página abre ese plan directamente
  validateSearch: (search: Record<string, unknown>): { plan?: string } =>
    typeof search.plan === "string" ? { plan: search.plan } : {},
});

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId",
  component: EditorPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: () => <AuthPage mode="login" />,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/register",
  component: () => <AuthPage mode="register" />,
  validateSearch: (search: Record<string, unknown>): { plan?: string } =>
    typeof search.plan === "string" ? { plan: search.plan } : {},
});

const resetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reset",
  component: () => <AuthPage mode="reset" />,
});

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite",
  component: () => <AuthPage mode="invite" />,
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([projectsRoute, mediaRoute, accountRoute, teamRoute, adminRoute, orgDefaultsRoute, planRoute]),
  editorRoute,
  loginRoute,
  registerRoute,
  resetRoute,
  inviteRoute,
]);

// En app.andarama.com el Studio vive en la raíz; en workers.dev y en el
// self-host, bajo /studio. El propio URL de entrada dice cuál de los dos es.
const basepath = location.pathname === "/studio" || location.pathname.startsWith("/studio/") ? "/studio" : "/";
const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

setupPwa();

// El plan elegido en la web (`/register?plan=paseo`) sobrevive al alta y
// llega hasta la página de planes
rememberPlanIntent();

// La instancia dice qué puerta usa antes de pintar nada: con Clerk, el
// Studio entero vive dentro de su proveedor; sin él, como siempre.
void loadInstanceConfig().then(() => {
  // De dónde viene la visita (gclid, utm_*): solo tiene sentido con planes
  if (isClerkMode()) captureAttributionFromBrowser();
  const app = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>{isClerkMode() ? <AndaClerkProvider>{app}</AndaClerkProvider> : app}</React.StrictMode>,
  );
});

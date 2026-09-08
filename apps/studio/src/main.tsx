import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { ToastProvider } from "@andarama/ui";
import "./index.css";
import { Shell } from "./components/Shell";
import { setupPwa } from "./pwa";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { OrgDefaultsPage } from "./pages/OrgDefaultsPage";
import { MediaPage } from "./pages/MediaPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { PlanPage } from "./pages/PlanPage";
import { AndaClerkProvider, isClerkMode, loadInstanceConfig } from "./clerk";
import { EditorPage } from "./editor/EditorPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } },
});

const rootRoute = createRootRoute({
  component: () => (
    <ToastProvider>
      <Outlet />
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

const adminRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/admin",
  component: AdminPage,
});

const planRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/plan",
  component: PlanPage,
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
  shellRoute.addChildren([projectsRoute, mediaRoute, accountRoute, adminRoute, orgDefaultsRoute, planRoute]),
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

// La instancia dice qué puerta usa antes de pintar nada: con Clerk, el
// Studio entero vive dentro de su proveedor; sin él, como siempre.
void loadInstanceConfig().then(() => {
  const app = (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>{isClerkMode() ? <AndaClerkProvider>{app}</AndaClerkProvider> : app}</React.StrictMode>,
  );
});

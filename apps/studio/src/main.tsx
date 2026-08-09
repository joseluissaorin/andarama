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
import { ToastProvider } from "@ull360/ui";
import "./index.css";
import { Shell } from "./components/Shell";
import { AuthPage } from "./pages/AuthPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { MediaPage } from "./pages/MediaPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
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
  shellRoute.addChildren([projectsRoute, mediaRoute, accountRoute, adminRoute]),
  editorRoute,
  loginRoute,
  registerRoute,
  resetRoute,
  inviteRoute,
]);

const router = createRouter({ routeTree, basepath: "/studio" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);

import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FolderKanban, Image, Languages, LogOut, Settings2, ShieldCheck, UserCircle } from "lucide-react";
import { Button, Select, Spinner, Tooltip } from "@ull360/ui";
import { useAuth } from "../stores";
import { useI18nStore, useT } from "../i18n";

/** Marco de navegacion del Studio. */
export function Shell(): React.ReactNode {
  const t = useT();
  const navigate = useNavigate();
  const { me, loaded, refresh, currentOrgId, setOrg, logout } = useAuth();
  const { lang, setLang } = useI18nStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loaded && me?.user == null) {
      void navigate({ to: "/login" });
    }
  }, [loaded, me, navigate]);

  if (!loaded || me?.user == null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-[var(--ull-border)] bg-[var(--ull-surface)]">
        <div className="flex items-center gap-2 px-4 py-4">
          <UllLogo />
          <span className="text-sm font-bold tracking-tight">ULL360</span>
        </div>
        {me.orgs.length > 0 && (
          <div className="px-3 pb-3">
            <Select
              aria-label="Organizacion"
              value={currentOrgId ?? ""}
              onChange={(e) => setOrg(e.target.value)}
              className="text-[13px]"
            >
              {me.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 px-2" aria-label="Principal">
          <NavItem to="/" icon={<FolderKanban className="h-4 w-4" />} label={t("projects")} />
          <NavItem to="/media" icon={<Image className="h-4 w-4" />} label={t("media_library")} />
          <NavItem to="/account" icon={<UserCircle className="h-4 w-4" />} label={me.user.name} />
          {me.user.roleGlobal === "admin" && (
            <NavItem to="/admin" icon={<ShieldCheck className="h-4 w-4" />} label={t("admin")} />
          )}
        </nav>
        <div className="flex items-center gap-1 border-t border-[var(--ull-border)] p-2">
          <Tooltip content={lang === "es" ? "English" : "Espanol"}>
            <Button variant="ghost" size="icon" aria-label="Idioma de la interfaz" onClick={() => setLang(lang === "es" ? "en" : "es")}>
              <Languages className="h-4 w-4" />
            </Button>
          </Tooltip>
          <div className="flex-1" />
          <Tooltip content={t("logout")}>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("logout")}
              onClick={() => {
                void logout().then(() => navigate({ to: "/login" }));
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }): React.ReactNode {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--ull-text-dim)] hover:bg-[var(--ull-surface-2)] [&.active]:bg-[var(--ull-surface-2)] [&.active]:font-medium [&.active]:text-[var(--ull-text)]"
      activeOptions={{ exact: to === "/" }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function UllLogo({ size = 26 }: { size?: number }): React.ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--ull-primary)" strokeWidth="3" />
      <ellipse cx="16" cy="16" rx="14" ry="6" fill="none" stroke="var(--ull-primary)" strokeWidth="2" opacity="0.6" />
      <circle cx="16" cy="16" r="3.5" fill="var(--ull-primary)" />
    </svg>
  );
}

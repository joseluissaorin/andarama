import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FolderKanban, Image, Languages, LogOut, ShieldCheck, UserCircle, Building2} from "lucide-react";
import { Button, Select, Spinner, Tooltip } from "@ull360/ui";
import { useAuth } from "../stores";
import { useI18nStore, useT } from "../i18n";
import logoUll360 from "../brand/logo-ull360.svg";
import iconoUll from "../brand/icono-ull.svg";
import iconoUllBlanco from "../brand/icono-ull-blanco.svg";

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
      <aside className="flex w-60 flex-col border-r border-[var(--ull-border)] bg-[var(--ull-surface)]">
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          {/* Marca de producto de ULL360 (propia); la institucional va aparte */}
          <img src={logoUll360} alt="" width={40} height={40} className="rounded-xl shadow-[var(--ull-shadow)]" />
          <div className="leading-tight">
            <span className="block text-[15px] font-bold tracking-tight">ULL360</span>
            <span className="block text-[11px] font-medium text-[var(--ull-text-dim)]">Universidad de La Laguna</span>
          </div>
        </div>
        {me.orgs.length > 0 && (
          <div className="px-3 pb-4">
            <Select
              aria-label="Organización"
              value={currentOrgId ?? ""}
              onChange={(e) => setOrg(e.target.value)}
              className="bg-[var(--ull-surface-2)] text-[13px] font-medium"
            >
              {me.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <p className="px-5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-[var(--ull-text-dim)]">
          {t("projects")}
        </p>
        <nav className="flex-1 space-y-0.5 px-3" aria-label="Principal">
          <NavItem to="/" icon={<FolderKanban className="h-4 w-4" />} label={t("projects")} />
          <NavItem to="/media" icon={<Image className="h-4 w-4" />} label={t("media_library")} />
          <NavItem to="/org" icon={<Building2 className="h-4 w-4" />} label={t("org_defaults")} />
          <NavItem to="/account" icon={<UserCircle className="h-4 w-4" />} label={me.user.name} />
          {me.user.roleGlobal === "admin" && (
            <NavItem to="/admin" icon={<ShieldCheck className="h-4 w-4" />} label={t("admin")} />
          )}
        </nav>
        <div className="mx-3 mb-3 flex items-center gap-1 rounded-xl bg-[var(--ull-surface-2)] p-1.5">
          <Tooltip content={lang === "es" ? "English" : "Español"}>
            <Button variant="ghost" size="icon" aria-label="Idioma de la interfaz" onClick={() => setLang(lang === "es" ? "en" : "es")}>
              <Languages className="h-4 w-4" />
            </Button>
          </Tooltip>
          <span className="flex-1 truncate px-1 text-xs font-medium text-[var(--ull-text-dim)]">{me.user.email}</span>
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
        <div className="ull-enter h-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }): React.ReactNode {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-[var(--ull-text-dim)] transition-colors hover:bg-[var(--ull-surface-2)] hover:text-[var(--ull-text)] [&.active]:bg-[var(--ull-primary-soft)] [&.active]:font-semibold [&.active]:text-[var(--ull-primary)] [&.active_.nav-accent]:opacity-100"
      activeOptions={{ exact: to === "/" }}
    >
      <span className="nav-accent absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--ull-primary)] opacity-0 transition-opacity" />
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** Símbolo oficial de la Universidad de La Laguna (ficheros del manual, sin alteración). */
export function UllLogo({ size = 26, light = false }: { size?: number; light?: boolean }): React.ReactNode {
  return <img src={light ? iconoUllBlanco : iconoUll} alt="" width={size} height={size} aria-hidden="true" style={{ display: "block" }} />;
}

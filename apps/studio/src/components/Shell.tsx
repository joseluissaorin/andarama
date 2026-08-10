import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, FolderKanban, Image, Languages, LogOut, Menu, RefreshCw, ShieldCheck, Share, UserCircle, Building2, X } from "lucide-react";
import { Button, Dialog, Select, Tooltip } from "@andarama/ui";
import { useAuth } from "../stores";
import { useI18nStore, useT } from "../i18n";
import { usePwa } from "../pwa";
import { Criatura } from "./Criatura";
import logoAndarama from "../brand/logo-andarama.svg";
import andaCriatura from "../brand/anda-criatura.svg";

/** Marco de navegacion del Studio. */
export function Shell(): React.ReactNode {
  const t = useT();
  const navigate = useNavigate();
  const { me, loaded, refresh, currentOrgId, setOrg, logout } = useAuth();
  const { lang, setLang } = useI18nStore();
  const pwa = usePwa();
  const [iosHelp, setIosHelp] = useState(false);
  // En pantallas estrechas la barra lateral es un cajón que se desliza
  const [menuAbierto, setMenuAbierto] = useState(false);

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
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <Criatura size={64} andando />
        <p className="text-[13px] font-medium text-[var(--anda-text-dim)]">{t("loading")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Cabecera móvil: la marca y el botón del cajón */}
      <header className="flex items-center gap-3 border-b border-[var(--anda-border)] bg-[var(--anda-surface)] px-4 py-2.5 md:hidden">
        <img src={logoAndarama} alt="" width={30} height={30} className="rounded-lg" />
        <span className="flex-1 text-[15px] font-bold tracking-tight">andarama</span>
        <Button variant="ghost" size="icon" aria-label="Menú" aria-expanded={menuAbierto} onClick={() => setMenuAbierto((v) => !v)}>
          {menuAbierto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {menuAbierto && (
        <button
          type="button"
          aria-label="Cerrar el menú"
          className="fixed inset-0 z-30 bg-[#0a0e20]/40 md:hidden"
          onClick={() => setMenuAbierto(false)}
        />
      )}
      <aside
        onClick={(e) => {
          // Navegar desde el cajón lo cierra; los botones sueltos no
          if ((e.target as HTMLElement).closest("a") != null) setMenuAbierto(false);
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-[var(--anda-border)] bg-[var(--anda-surface)] transition-transform duration-200 md:static md:z-auto md:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex items-center gap-3 px-4 pb-4 pt-5">
          <img src={logoAndarama} alt="" width={40} height={40} className="rounded-xl shadow-[var(--anda-shadow)]" />
          <div className="leading-tight">
            <span className="block text-[17px] font-bold tracking-tight">andarama</span>
            <span className="block text-[11px] font-medium text-[var(--anda-text-dim)]">Studio</span>
          </div>
        </div>
        {me.orgs.length > 0 && (
          <div className="px-3 pb-4">
            <Select
              aria-label="Organización"
              value={currentOrgId ?? ""}
              onChange={(e) => setOrg(e.target.value)}
              className="bg-[var(--anda-surface-2)] text-[13px] font-medium"
            >
              {me.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <p className="px-5 pb-2 text-[10.5px] font-bold uppercase tracking-[0.09em] text-[var(--anda-text-dim)]">
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
        {/* Instalarla y avisar de una versión nueva: lo que espera cualquiera
            de una aplicación de escritorio o de iPad. */}
        {pwa.updateReady && (
          <button
            type="button"
            onClick={pwa.applyUpdate}
            className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-[var(--anda-primary-soft)] px-3 py-2 text-left text-[12.5px] font-medium text-[var(--anda-primary)]"
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            {t("update_ready")}
          </button>
        )}
        {!pwa.installed && (pwa.installable || pwa.iosManual) && (
          <button
            type="button"
            onClick={() => {
              if (pwa.installable) void pwa.install();
              else setIosHelp(true);
            }}
            className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-dashed border-[var(--anda-border)] px-3 py-2 text-left text-[12.5px] font-medium text-[var(--anda-text-dim)] hover:border-[var(--anda-primary)] hover:text-[var(--anda-primary)]"
          >
            <Download className="h-4 w-4 shrink-0" />
            {t("install_app")}
          </button>
        )}
        <div className="mx-3 mb-3 flex items-center gap-1 rounded-xl bg-[var(--anda-surface-2)] p-1.5">
          <Tooltip content={lang === "es" ? "English" : "Español"}>
            <Button variant="ghost" size="icon" aria-label="Idioma de la interfaz" onClick={() => setLang(lang === "es" ? "en" : "es")}>
              <Languages className="h-4 w-4" />
            </Button>
          </Tooltip>
          <span className="flex-1 truncate px-1 text-xs font-medium text-[var(--anda-text-dim)]">{me.user.email}</span>
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
        <div className="anda-enter h-full">
          <Outlet />
        </div>
      </main>
      {/* En iPad y iPhone, Safari no ofrece diálogo: se instala a mano */}
      <Dialog open={iosHelp} onOpenChange={setIosHelp} title={t("install_app")} description={t("install_ios_hint")}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
          <li className="flex items-center gap-1.5">
            <Share className="h-4 w-4 text-[var(--anda-primary)]" /> {t("install_ios_step_share")}
          </li>
          <li>{t("install_ios_step_add")}</li>
          <li>{t("install_ios_step_confirm")}</li>
        </ol>
      </Dialog>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }): React.ReactNode {
  return (
    <Link
      to={to}
      className="group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-[var(--anda-text-dim)] transition-colors hover:bg-[var(--anda-surface-2)] hover:text-[var(--anda-text)] [&.active]:bg-[var(--anda-primary-soft)] [&.active]:font-semibold [&.active]:text-[var(--anda-primary)] [&.active_.nav-accent]:opacity-100"
      activeOptions={{ exact: to === "/" }}
    >
      <span className="nav-accent absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-[var(--anda-primary)] opacity-0 transition-opacity" />
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** La criatura de Andarama, sin fondo: para cabeceras compactas. */
export function AndaLogo({ size = 26 }: { size?: number }): React.ReactNode {
  return <img src={andaCriatura} alt="" width={size} height={size} aria-hidden="true" style={{ display: "block" }} />;
}

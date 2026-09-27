import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, useToast } from "@andarama/ui";
import { api, ApiRequestError } from "../api";
import { useT } from "../i18n";

interface Registration {
  id: string;
  orgId: string | null;
  issuer: string;
  clientId: string;
  deploymentId: string | null;
  toolEndpoints: Record<string, string>;
}

/**
 * Plataformas LTI registradas. Sin `orgId` es la vista del operador (todas
 * las de la instancia); con `orgId`, la del administrador de esa
 * organización, que solo ve y da de alta las suyas. El servidor comprueba
 * que su plan incluya LTI.
 */
export function LtiRegistrations({ orgId }: { orgId?: string }): React.ReactNode {
  const t = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["lti-registrations", orgId ?? "instancia"];
  const q = useQuery({
    queryKey,
    queryFn: () => api<Registration[]>(orgId != null ? `/lti/registrations?orgId=${orgId}` : "/lti/registrations"),
  });
  const [form, setForm] = useState({ issuer: "", clientId: "", deploymentId: "", authUrl: "", tokenUrl: "", jwksUrl: "" });
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      toast.push(err instanceof ApiRequestError ? (err.detail ?? err.title) : String(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const endpoints = q.data?.[0]?.toolEndpoints ?? {
    login: `${location.origin}/api/v1/lti/login`,
    launch: `${location.origin}/api/v1/lti/launch`,
    jwks: `${location.origin}/api/v1/lti/jwks`,
    deepLinking: `${location.origin}/api/v1/lti/launch`,
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="anda-ficha p-4 text-xs">
        <p className="mb-2 font-semibold">{t("lti_endpoints_hint")}</p>
        {Object.entries(endpoints).map(([k, v]) => (
          <p key={k} className="font-mono">
            {k}: {v}
          </p>
        ))}
      </div>
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="flex items-center gap-3 anda-ficha px-4 py-2.5 text-sm">
          <span className="flex-1 truncate">{r.issuer}</span>
          <span className="font-mono text-xs text-[var(--anda-text-dim)]">{r.clientId}</span>
          {orgId == null && r.orgId == null && (
            <span className="text-xs text-[var(--anda-text-dim)]">{t("lti_no_org")}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("delete")}
            disabled={busy}
            onClick={() => void run(() => api(`/lti/registrations/${r.id}`, { method: "DELETE" }))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <div className="space-y-3 rounded-lg border border-dashed border-[var(--anda-border)] p-4">
        {(
          [
            ["issuer", "Issuer (https://moodle.example.org)"],
            ["clientId", "Client ID"],
            ["deploymentId", "Deployment ID"],
            ["authUrl", "Auth URL (/mod/lti/auth.php)"],
            ["tokenUrl", "Token URL (/mod/lti/token.php)"],
            ["jwksUrl", "JWKS URL (/mod/lti/certs.php)"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label} htmlFor={`lti-${orgId ?? "instancia"}-${key}`}>
            <Input
              id={`lti-${orgId ?? "instancia"}-${key}`}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Button
          loading={busy}
          onClick={() =>
            void run(async () => {
              await api("/lti/registrations", {
                method: "POST",
                body: { ...form, deploymentId: form.deploymentId || undefined, ...(orgId != null ? { orgId } : {}) },
              });
              setForm({ issuer: "", clientId: "", deploymentId: "", authUrl: "", tokenUrl: "", jwksUrl: "" });
            })
          }
          disabled={form.issuer === "" || form.clientId === "" || form.authUrl === "" || form.tokenUrl === "" || form.jwksUrl === ""}
        >
          <Plus className="h-4 w-4" /> {t("create")}
        </Button>
      </div>
    </div>
  );
}

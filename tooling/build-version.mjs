// Versión visible de cada build: «<versión del paquete>+<sha corto> · <fecha>».
// La inyectan el Studio (Vite `define`) y el bundle del visor (esbuild
// `define`), para que quien informa de un problema diga qué versión probó.
// Sin .git (imagen Docker, tarball) el sha sale de ANDARAMA_GIT_SHA o queda
// en «local».
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} packageDir directorio con el package.json cuya versión manda */
export function buildVersion(packageDir) {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")).version ?? version;
  } catch {
    // sin package.json legible: se queda la versión nula
  }
  let sha = process.env.ANDARAMA_GIT_SHA?.slice(0, 7) ?? "";
  if (sha === "") {
    try {
      sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: packageDir, stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      sha = "local";
    }
  }
  const fecha = new Date().toISOString().slice(0, 10);
  return `${version}+${sha} · ${fecha}`;
}

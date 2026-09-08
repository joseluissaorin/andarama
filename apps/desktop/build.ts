/**
 * Compila el ejecutable de escritorio para cada sistema.
 *
 * Se ejecuta desde la raíz del repositorio (`pnpm build:desktop` o
 * `bun run apps/desktop/build.ts [objetivo...]`), con los paquetes, la
 * documentación y el Studio ya construidos: los assets se embeben con su
 * ruta relativa a la raíz, que es la que espera `src/main.ts`.
 */
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const out = join(root, "apps/desktop/dist");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { version: string };

const TARGETS: Record<string, Bun.Build.CompileTarget> = {
  "macos-arm64": "bun-darwin-arm64",
  "macos-x64": "bun-darwin-x64",
  "windows-x64": "bun-windows-x64",
  "linux-x64": "bun-linux-x64",
  "linux-arm64": "bun-linux-arm64",
};

const wanted = process.argv.slice(2);
const names = wanted.length > 0 ? wanted : Object.keys(TARGETS);
for (const name of names) {
  if (!(name in TARGETS)) {
    console.error(`Objetivo desconocido: ${name}. Válidos: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of names) {
  const target = TARGETS[name]!;
  const outfile = join(out, `andarama-${name}`);
  console.log(`\n→ ${name} (${target})`);
  const result = await Bun.build({
    entrypoints: [join(root, "apps/desktop/src/main.ts")],
    compile: {
      target,
      outfile,
      assets: ["apps/studio/dist-root", "packages/db/migrations"],
      autoloadDotenv: false,
      autoloadBunfig: false,
    },
    // better-sqlite3 solo lo importa la variante Node; el escritorio usa bun:sqlite
    external: ["better-sqlite3"],
    minify: true,
    sourcemap: "linked",
    define: { ANDA_VERSION: JSON.stringify(pkg.version) },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exit(1);
  }
  for (const o of result.outputs) console.log(`  ${o.path} (${(o.size / 1024 / 1024).toFixed(1)} MB)`);
}
console.log(`\nEjecutables en ${out}`);

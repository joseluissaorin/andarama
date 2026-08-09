#!/usr/bin/env node
/**
 * CLI del tiler para el contenedor de procesado y automatizacion:
 *   ull360-tile <imagen> <directorio-salida> [--tile-size 512] [--format webp]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tilePanoramaNode } from "./index.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const input = positional[0];
  const outDir = positional[1];
  if (input == null || outDir == null) {
    console.error("Uso: ull360-tile <imagen-equirect> <directorio-salida> [--tile-size N] [--format webp|jpeg|avif]");
    process.exit(2);
  }
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  let count = 0;
  const result = await tilePanoramaNode(
    input,
    {
      tileSize: opt("tile-size") != null ? parseInt(opt("tile-size")!, 10) : undefined,
      format: (opt("format") as "webp" | "jpeg" | "avif" | undefined) ?? "webp",
    },
    async (tile) => {
      const path = join(outDir, tile.key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, tile.data);
      count++;
      if (count % 100 === 0) console.log(`${count} tiles...`);
    },
  );
  await writeFile(join(outDir, "manifest.json"), JSON.stringify(result.manifest, null, 2));
  await writeFile(join(outDir, "thumb.jpg"), result.thumbnail);
  await writeFile(join(outDir, "og.jpg"), result.ogImage);
  console.log(`Completado: ${count} tiles, ${result.manifest.levels} niveles, cara ${result.manifest.faceSize}px`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Escritor ZIP minimo en streaming. Los tiles WebP/JPEG, los vídeos y el
 * resto de medios ya vienen comprimidos y se guardan tal cual (STORE):
 * recomprimirlos solo gasta tiempo. Los ficheros de texto (tour.json, el
 * visor, HTML, CSS, SVG…) se comprimen con DEFLATE usando CompressionStream,
 * que es nativo y no bloquea el hilo, si el entorno lo tiene; si no, STORE.
 * Funciona en navegador y Node sin dependencias. Límite: formato ZIP clásico
 * (< 4 GB y < 65535 entradas).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, seed = 0): number {
  let crc = seed ^ 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface CentralEntry {
  name: Uint8Array;
  crc: number;
  size: number;
  compressedSize: number;
  method: number;
  offset: number;
  dosTime: number;
  dosDate: number;
}

/** Extensiones que merece la pena comprimir: texto. El resto ya lo está. */
const COMPRESSIBLE = /\.(json|js|mjs|cjs|html|htm|css|svg|md|txt|xml|vtt|srt|webmanifest|map|csv|obj|gltf|stl)$|(^|\/)\.htaccess$/i;

export function isCompressible(name: string): boolean {
  return COMPRESSIBLE.test(name);
}

/** DEFLATE crudo con CompressionStream; null si el entorno no lo tiene. */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  const CS = (globalThis as { CompressionStream?: new (format: string) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } }).CompressionStream;
  if (CS == null) return null;
  try {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CS("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export interface ZipWriterOptions {
  /**
   * Comprimir los ficheros de texto. `true` (por defecto) usa
   * CompressionStream si existe; `false` lo guarda todo sin comprimir; una
   * función permite otro compresor (devuelve null para guardar sin comprimir).
   */
  deflate?: boolean | ((data: Uint8Array) => Promise<Uint8Array | null>);
}

function dosDateTime(date: Date): { dosTime: number; dosDate: number } {
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: (((date.getFullYear() - 1980) & 0x7f) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function u16(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
}

function u32(v: number): Uint8Array {
  return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Escritor incremental: write(chunk) va emitiendo los bytes del ZIP segun
 * se anaden entradas (streaming real: nunca retiene el paquete completo).
 */
export class ZipWriter {
  private entries: CentralEntry[] = [];
  private offset = 0;
  private closed = false;

  private deflate: ((data: Uint8Array) => Promise<Uint8Array | null>) | null;

  constructor(
    private write: (chunk: Uint8Array) => void | Promise<void>,
    options: ZipWriterOptions = {},
  ) {
    this.deflate = options.deflate === false ? null : typeof options.deflate === "function" ? options.deflate : deflateRaw;
  }

  async addFile(name: string, data: Uint8Array, date = new Date(2024, 0, 1, 12, 0, 0)): Promise<void> {
    if (this.closed) throw new Error("ZIP cerrado");
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(date);
    let body = data;
    let method = 0; // STORE
    if (this.deflate != null && data.length > 256 && isCompressible(name)) {
      const packed = await this.deflate(data);
      if (packed != null && packed.length < data.length) {
        body = packed;
        method = 8; // DEFLATE
      }
    }
    const header = concat(
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // UTF-8 names
      u16(method),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(body.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    );
    this.entries.push({ name: nameBytes, crc, size: data.length, compressedSize: body.length, method, offset: this.offset, dosTime, dosDate });
    // Las longitudes se toman antes de escribir: quien recibe los trozos
    // puede transferirlos (Web Worker) y dejarlos vacíos
    const written = header.length + body.length;
    await this.write(header);
    await this.write(body);
    this.offset += written;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const centralStart = this.offset;
    let centralSize = 0;
    for (const e of this.entries) {
      const record = concat(
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(e.method),
        u16(e.dosTime),
        u16(e.dosDate),
        u32(e.crc),
        u32(e.compressedSize),
        u32(e.size),
        u16(e.name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(e.offset),
        e.name,
      );
      centralSize += record.length;
      await this.write(record);
    }
    const eocd = concat(
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(this.entries.length),
      u16(this.entries.length),
      u32(centralSize),
      u32(centralStart),
      u16(0),
    );
    const eocdLength = eocd.length;
    await this.write(eocd);
    this.offset += centralSize + eocdLength;
  }

  get bytesWritten(): number {
    return this.offset;
  }

  get fileCount(): number {
    return this.entries.length;
  }
}

/** Conveniencia: construye un ZIP completo en memoria. */
export async function buildZip(files: { name: string; data: Uint8Array }[], options: ZipWriterOptions = {}): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter((c) => {
    chunks.push(c);
  }, options);
  for (const f of files) {
    await writer.addFile(f.name, f.data);
  }
  await writer.close();
  return concat(...chunks);
}

/**
 * Escritor ZIP minimo en streaming (metodo STORE, sin compresion: los
 * tiles WebP/JPEG y medios ya vienen comprimidos). Funciona en navegador
 * y Node sin dependencias. Limite: formato ZIP clasico (< 4 GB y < 65535
 * entradas), suficiente y documentado; el visor exporta tiles ya optimizados.
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
  offset: number;
  dosTime: number;
  dosDate: number;
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

  constructor(private write: (chunk: Uint8Array) => void | Promise<void>) {}

  async addFile(name: string, data: Uint8Array, date = new Date(2024, 0, 1, 12, 0, 0)): Promise<void> {
    if (this.closed) throw new Error("ZIP cerrado");
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { dosTime, dosDate } = dosDateTime(date);
    const header = concat(
      u32(0x04034b50),
      u16(20), // version needed
      u16(0x0800), // UTF-8 names
      u16(0), // method STORE
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    );
    this.entries.push({ name: nameBytes, crc, size: data.length, offset: this.offset, dosTime, dosDate });
    await this.write(header);
    await this.write(data);
    this.offset += header.length + data.length;
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
        u16(0),
        u16(e.dosTime),
        u16(e.dosDate),
        u32(e.crc),
        u32(e.size),
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
      await this.write(record);
      centralSize += record.length;
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
    await this.write(eocd);
    this.offset += centralSize + eocd.length;
  }

  get bytesWritten(): number {
    return this.offset;
  }

  get fileCount(): number {
    return this.entries.length;
  }
}

/** Conveniencia: construye un ZIP completo en memoria. */
export async function buildZip(files: { name: string; data: Uint8Array }[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const writer = new ZipWriter((c) => {
    chunks.push(c);
  });
  for (const f of files) {
    await writer.addFile(f.name, f.data);
  }
  await writer.close();
  return concat(...chunks);
}

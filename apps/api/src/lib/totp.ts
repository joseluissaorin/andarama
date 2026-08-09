/** TOTP (RFC 6238) sobre WebCrypto, sin dependencias. SHA-1, 6 digitos, 30 s. */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Uint8Array {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(4, counter);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1]! & 0xf;
  const code =
    (((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!) %
    1_000_000;
  return String(code).padStart(6, "0");
}

/** Verifica un codigo TOTP con ventana de +-1 periodo. */
export async function verifyTotp(secretBase32: string, code: string): Promise<boolean> {
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 30000);
  for (const delta of [0, -1, 1]) {
    if ((await hotp(secret, counter + delta)) === code.trim()) return true;
  }
  return false;
}

export function totpUri(secretBase32: string, email: string, issuer: string): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

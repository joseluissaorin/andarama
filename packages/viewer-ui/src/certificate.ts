/**
 * Certificado de finalizacion en PDF, generado integramente en cliente sin
 * dependencias: se construye un PDF 1.4 minimo (una pagina A4 apaisada con
 * texto Helvetica y marco). Suficiente para un certificado con nombre,
 * titulo del tour, puntuacion y fecha.
 */

interface CertificateData {
  participantName: string;
  tourTitle: string;
  certTitle: string;
  scoreLine: string;
  dateLine: string;
  signature?: string;
}

function escapePdfText(s: string): string {
  // Helvetica estandar es Latin-1; se transliteran caracteres fuera de rango.
  return s
    .normalize("NFC")
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 256 ? ch : "?"))
    .join("");
}

export function generateCertificatePdf(data: CertificateData): Blob {
  // A4 apaisado: 842 x 595 pt
  const W = 842;
  const H = 595;
  const center = (size: number, text: string): number => {
    // Aproximacion de ancho Helvetica: 0.52 * size por caracter de media.
    const width = text.length * size * 0.5;
    return (W - width) / 2;
  };

  const lines: string[] = [];
  lines.push("q 2 w 0.36 0.41 0.65 RG 30 30 m 782 0 re S Q".replace("m 782", `30 ${H - 60} 782`));
  const content: string[] = [];
  content.push("q");
  content.push("0.36 0.41 0.65 RG 3 w");
  content.push(`30 30 ${W - 60} ${H - 60} re S`);
  content.push("1.5 w");
  content.push(`40 40 ${W - 80} ${H - 80} re S`);
  content.push("Q");

  const text = (x: number, y: number, size: number, str: string, bold = false, gray = false): void => {
    content.push("BT");
    content.push(`/${bold ? "F2" : "F1"} ${size} Tf`);
    content.push(gray ? "0.35 0.38 0.45 rg" : "0.1 0.12 0.2 rg");
    content.push(`${x.toFixed(1)} ${y.toFixed(1)} Td`);
    content.push(`(${escapePdfText(str)}) Tj`);
    content.push("ET");
  };

  text(center(30, data.certTitle), 470, 30, data.certTitle, true);
  text(center(14, data.tourTitle), 430, 14, data.tourTitle, false, true);
  text(center(36, data.participantName), 330, 36, data.participantName, true);
  text(center(15, data.scoreLine), 260, 15, data.scoreLine);
  text(center(12, data.dateLine), 220, 12, data.dateLine, false, true);
  if (data.signature != null && data.signature !== "") {
    text(center(12, data.signature), 120, 12, data.signature, false, true);
    const sigWidth = 220;
    content.push(`q 0.5 w 0.35 0.38 0.45 RG ${(W - sigWidth) / 2} 140 m ${(W + sigWidth) / 2} 140 l S Q`);
  }

  const stream = content.join("\n");
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
  objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

export function downloadCertificate(data: CertificateData): void {
  const blob = generateCertificatePdf(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "certificado-andarama.pdf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

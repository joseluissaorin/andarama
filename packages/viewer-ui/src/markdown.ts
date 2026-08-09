/**
 * Renderizador Markdown minimo y seguro (lista blanca) para hotspots de
 * texto: titulos, negrita, cursiva, enlaces, listas, tablas, codigo,
 * citas y saltos. Todo el texto se escapa antes de aplicar el formato;
 * nunca se interpreta HTML de entrada (proteccion XSS).
 */

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+|tel:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.replaceAll("\r\n", "\n").split("\n");
  const html: string[] = [];
  let inUl = false;
  let inOl = false;
  let inQuote = false;
  let inCode = false;
  let tableBuffer: string[] = [];

  const closeLists = (): void => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
    if (inQuote) {
      html.push("</blockquote>");
      inQuote = false;
    }
  };

  const flushTable = (): void => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer.filter((r) => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r));
    const cells = (row: string): string[] =>
      row
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .split("|")
        .map((c) => c.trim());
    let out = "<table>";
    rows.forEach((row, i) => {
      const tag = i === 0 ? "th" : "td";
      out += `<tr>${cells(row)
        .map((c) => `<${tag}>${inline(c)}</${tag}>`)
        .join("")}</tr>`;
    });
    out += "</table>";
    html.push(out);
    tableBuffer = [];
  };

  for (const raw of lines) {
    const line = raw;
    if (inCode) {
      if (/^```/.test(line)) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        html.push(escapeHtml(line));
      }
      continue;
    }
    if (/^```/.test(line)) {
      closeLists();
      flushTable();
      html.push("<pre><code>");
      inCode = true;
      continue;
    }
    if (/^\s*\|.*\|/.test(line)) {
      closeLists();
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading != null) {
      closeLists();
      const level = heading[1]!.length + 1; // h2..h5 (h1 reservado al panel)
      html.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul != null) {
      if (!inUl) {
        closeLists();
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol != null) {
      if (!inOl) {
        closeLists();
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote != null) {
      if (!inQuote) {
        closeLists();
        html.push("<blockquote>");
        inQuote = true;
      }
      html.push(`<p>${inline(quote[1]!)}</p>`);
      continue;
    }
    if (line.trim() === "") {
      closeLists();
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      closeLists();
      html.push("<hr>");
      continue;
    }
    closeLists();
    html.push(`<p>${inline(line)}</p>`);
  }
  closeLists();
  flushTable();
  if (inCode) html.push("</code></pre>");
  return html.join("\n");
}

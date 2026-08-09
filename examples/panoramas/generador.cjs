const sharp = require("sharp");
async function pano(name, hue, label) {
  const W = 4096, H = 2048;
  const marks = [];
  const points = [[W/2, "FRENTE"], [W*0.25, "OESTE"], [W*0.75, "ESTE"], [64, "ATRAS"]];
  for (const [x, txt] of points) {
    marks.push(`<rect x="${x-150}" y="${H/2-120}" width="300" height="240" rx="24" fill="rgba(255,255,255,0.92)"/>`);
    marks.push(`<text x="${x}" y="${H/2+10}" font-size="72" text-anchor="middle" font-family="Helvetica" font-weight="bold" fill="#1c2340">${txt}</text>`);
    marks.push(`<text x="${x}" y="${H/2+90}" font-size="44" text-anchor="middle" font-family="Helvetica" fill="#5a627e">${label}</text>`);
  }
  let grid = "";
  for (let i = 0; i <= 16; i++) grid += `<line x1="${(W/16)*i}" y1="0" x2="${(W/16)*i}" y2="${H}" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>`;
  for (let j = 0; j <= 8; j++) grid += `<line x1="0" y1="${(H/8)*j}" x2="${W}" y2="${(H/8)*j}" stroke="rgba(255,255,255,0.25)" stroke-width="3"/>`;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="hsl(${hue}, 65%, 72%)"/>
      <stop offset="0.5" stop-color="hsl(${hue}, 55%, 52%)"/>
      <stop offset="0.55" stop-color="hsl(${(hue+40)%360}, 35%, 38%)"/>
      <stop offset="1" stop-color="hsl(${(hue+40)%360}, 30%, 20%)"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${grid}${marks.join("")}
  <text x="${W/2}" y="180" font-size="96" text-anchor="middle" font-family="Helvetica" font-weight="bold" fill="rgba(255,255,255,0.85)">${label} - CENIT</text>
  <text x="${W/2}" y="${H-100}" font-size="96" text-anchor="middle" font-family="Helvetica" font-weight="bold" fill="rgba(255,255,255,0.6)">${label} - NADIR</text>
  </svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(`/tmp/ull360-media/${name}.jpg`);
  console.log(name, "ok");
}
(async () => {
  await pano("entrada-campus", 210, "ENTRADA");
  await pano("pasillo-central", 140, "PASILLO");
  await pano("aula-magna", 20, "AULA MAGNA");
})();

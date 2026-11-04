// Regenerates public/icons. The PNGs are committed, so this only needs to run when the icon changes:
//   node scripts/make-icons.mjs
import sharp from "sharp";

const icon = (size, inset) => {
  const c = size / 2;
  const r = size * (0.5 - inset);
  const font = size * (inset ? 0.3 : 0.4);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#0a0a12"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#a855f7" stroke-width="${size * 0.03}"/>
    <path d="M ${c - r * 0.75} ${c + r * 0.75} A ${r * 1.06} ${r * 1.06} 0 1 1 ${c + r * 0.75} ${c + r * 0.75}"
      fill="none" stroke="#22d3ee" stroke-width="${size * 0.05}" stroke-linecap="round"/>
    <text x="${c}" y="${c + font * 0.36}" text-anchor="middle" font-family="Consolas, monospace" font-weight="700"
      font-size="${font}" fill="#e4e6f0">NL</text>
  </svg>`);
};

const out = [
  ["public/icons/icon-192.png", 192, 0.04],
  ["public/icons/icon-512.png", 512, 0.04],
  ["public/icons/apple-touch-icon.png", 180, 0.04],
  ["public/icons/icon-maskable-512.png", 512, 0.16],
];
for (const [file, size, inset] of out) {
  await sharp(icon(size, inset)).png().toFile(file);
  console.log(file);
}

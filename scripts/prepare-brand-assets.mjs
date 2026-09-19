import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Reuse the existing framework's Sharp dependency, without another runtime package.
const sharp = require(
  require.resolve("sharp", {
    paths: [path.dirname(require.resolve("next/package.json"))],
  }),
);
const root = new URL("../", import.meta.url);
const svg = await fs.readFile(new URL("public/brand/spindle.svg", root));
const small = await fs.readFile(
  new URL("public/brand/spindle-small.svg", root),
);
await fs.writeFile(
  new URL("desktop/icon.png", root),
  await sharp(svg).resize(256, 256).png().toBuffer(),
);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(size <= 64 ? small : svg)
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const at = 6 + 16 * i;
  header[at] = size === 256 ? 0 : size;
  header[at + 1] = header[at];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
});
await fs.writeFile(
  new URL("desktop/icon.ico", root),
  Buffer.concat([header, ...images]),
);
await fs.copyFile(
  new URL("public/brand/spindle-small.svg", root),
  new URL("public/favicon.svg", root),
);
const splash = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="180"><rect width="480" height="180" fill="#202020"/><text x="170" y="82" font-family="Segoe UI" font-size="30" fill="#ddd">Spindle</text><text x="170" y="113" font-family="Microsoft JhengHei" font-size="14" fill="#aaa">正在解壓並啟動…</text></svg>',
);
const icon = await sharp(svg).resize(104, 104).png().toBuffer();
const { data, info } = await sharp(splash)
  .composite([{ input: icon, left: 38, top: 38 }])
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const stride = Math.ceil((info.width * 3) / 4) * 4,
  bmp = Buffer.alloc(54 + stride * info.height);
bmp.write("BM");
bmp.writeUInt32LE(bmp.length, 2);
bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14);
bmp.writeInt32LE(info.width, 18);
bmp.writeInt32LE(info.height, 22);
bmp.writeUInt16LE(1, 26);
bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(stride * info.height, 34);
for (let y = 0; y < info.height; y++)
  for (let x = 0; x < info.width; x++) {
    const src = (y * info.width + x) * 3,
      dst = 54 + (info.height - 1 - y) * stride + x * 3;
    bmp[dst] = data[src + 2];
    bmp[dst + 1] = data[src + 1];
    bmp[dst + 2] = data[src];
  }
await fs.writeFile(new URL("desktop/portable-splash.bmp", root), bmp);
console.log("Spindle SVG → PNG, multi-size ICO, favicon and portable splash");

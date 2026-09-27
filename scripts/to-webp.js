const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/to-webp.js <file1.png> [file2.png ...]");
  process.exit(1);
}

(async () => {
  for (const f of files) {
    const src = path.resolve(f);
    const out = src.replace(/\.png$/i, ".webp");
    const before = fs.statSync(src).size;
    await sharp(src).webp({ quality: 90 }).toFile(out);
    const after = fs.statSync(out).size;
    console.log(`${path.basename(src)}: ${(before / 1024).toFixed(0)}KB -> ${path.basename(out)}: ${(after / 1024).toFixed(0)}KB`);
  }
})();

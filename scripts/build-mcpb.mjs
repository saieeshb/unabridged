#!/usr/bin/env node
// Build dist/cc-exporter.mcpb (a zip with manifest.json at its root) for Claude Desktop.
// Pure Node, so it runs the same on Windows, macOS and Linux.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'cc-exporter.mcpb');
const INCLUDE = ['manifest.json', 'package.json', 'README.md', 'LICENSE', 'assets/icon.png', 'bin', 'mcp', 'lib', 'scripts/export-chat.mjs'];
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);

const TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dos(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

function collect(rel, out) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs).sort()) if (!SKIP.has(name)) collect(path.join(rel, name), out);
  } else if (st.isFile()) {
    out.push({ name: rel.split(path.sep).join('/'), abs, mtime: st.mtime });
  }
}

const files = [];
for (const entry of INCLUDE) collect(entry, files);
if (!files.some((f) => f.name === 'manifest.json')) throw new Error('manifest.json is missing');

const parts = [];
const central = [];
let offset = 0;
for (const f of files) {
  const data = fs.readFileSync(f.abs);
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const name = Buffer.from(f.name, 'utf8');
  const crc = crc32(data);
  const { time, date } = dos(f.mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);
  parts.push(local, name, comp);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(8, 10);
  cd.writeUInt16LE(time, 12);
  cd.writeUInt16LE(date, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(comp.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(name.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, name);
  offset += local.length + name.length + comp.length;
}

const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([...parts, cdBuf, end]));
console.log(`Built ${path.relative(ROOT, OUT)} (${files.length} files, ${(fs.statSync(OUT).size / 1024).toFixed(1)} KB)`);

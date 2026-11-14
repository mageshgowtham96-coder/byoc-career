import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // Scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  let srcOffset = 0;
  let dstOffset = 0;
  for (let y = 0; y < height; y++) {
    scanlines[dstOffset++] = 0;
    rgbaBuffer.copy(scanlines, dstOffset, srcOffset, srcOffset + width * 4);
    dstOffset += width * 4;
    srcOffset += width * 4;
  }

  const idatData = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createChunk('IDAT', idatData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Render the Sri Sudarsana Chakra into RGBA buffer
 * mode: 'square' | 'round' | 'foreground'
 */
function renderChakraIcon(size, mode = 'square') {
  const buffer = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;

  // Foreground mode scales the emblem into the 72dp safe zone of the 108dp canvas
  const emblemScale = mode === 'foreground' ? 0.72 : 0.88;
  const rSafe = maxR * emblemScale;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      const d = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;

      // 1. Initial Background
      let r = 15;  // #0f172a Deep Navy
      let g = 23;
      let b = 42;
      let a = 255;

      if (mode === 'round') {
        if (d > maxR) {
          a = 0;
        } else if (d > maxR - 1.2) {
          a = Math.round(255 * (maxR - d) / 1.2);
        }
      } else if (mode === 'foreground') {
        r = 0; g = 0; b = 0; a = 0;
      }

      if (a === 0 && mode !== 'foreground') {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
        continue;
      }

      // 2. Soft Ambient Radial Glow
      if (d < rSafe * 1.05) {
        const glowFactor = Math.max(0, 1 - d / (rSafe * 1.05));
        const glowAlpha = Math.pow(glowFactor, 1.8) * 0.45;
        // Blend in sky-blue & indigo glow (#38bdf8 / #6366f1)
        r = Math.min(255, Math.round(r + 56 * glowAlpha));
        g = Math.min(255, Math.round(g + 189 * glowAlpha));
        b = Math.min(255, Math.round(b + 248 * glowAlpha));
        if (mode === 'foreground') {
          a = Math.min(255, Math.round(glowAlpha * 140));
        }
      }

      // 3. 16 Geometric Serrated Sudarsana Blades
      // Radiating from rSafe * 0.62 to rSafe * 0.94
      const bladeInner = rSafe * 0.62;
      const bladeOuter = rSafe * 0.94;
      if (d >= bladeInner * 0.95 && d <= bladeOuter * 1.05) {
        // Find nearest 22.5 deg blade
        const bladeIndex = Math.round(angle / 22.5) % 16;
        const bladeCenterAngle = bladeIndex * 22.5;
        let deltaAngle = Math.abs(angle - bladeCenterAngle);
        if (deltaAngle > 180) deltaAngle = 360 - deltaAngle;

        const bladeProgress = (d - bladeInner) / (bladeOuter - bladeInner);
        // Blade tapers from angular width 6.0 deg at base to 0 deg at tip
        const allowedWidth = (1 - bladeProgress) * 5.8;

        if (deltaAngle <= allowedWidth) {
          const edgeAlpha = Math.min(1, (allowedWidth - deltaAngle) * 1.5);
          // Color gradient from tip (#38bdf8) to mid (#6366f1) to base (#a855f7)
          let br, bg, bb;
          if (bladeProgress > 0.5) {
            const t = (bladeProgress - 0.5) * 2;
            br = Math.round(99 + (56 - 99) * t);
            bg = Math.round(102 + (189 - 102) * t);
            bb = Math.round(241 + (248 - 241) * t);
          } else {
            const t = bladeProgress * 2;
            br = Math.round(168 + (99 - 168) * t);
            bg = Math.round(85 + (102 - 85) * t);
            bb = Math.round(247 + (241 - 247) * t);
          }
          r = Math.round(r * (1 - edgeAlpha) + br * edgeAlpha);
          g = Math.round(g * (1 - edgeAlpha) + bg * edgeAlpha);
          b = Math.round(b * (1 - edgeAlpha) + bb * edgeAlpha);
          a = Math.max(a, Math.round(edgeAlpha * 240));
        }
      }

      // 4. Outer Precision Serrated Ring (at rSafe * 0.66)
      const ring1R = rSafe * 0.66;
      const distToRing1 = Math.abs(d - ring1R);
      const ring1Width = Math.max(1.2, size * 0.012);
      if (distToRing1 < ring1Width) {
        const alpha = 1 - distToRing1 / ring1Width;
        r = Math.round(r * (1 - alpha) + 56 * alpha);
        g = Math.round(g * (1 - alpha) + 189 * alpha);
        b = Math.round(b * (1 - alpha) + 248 * alpha);
        a = Math.max(a, Math.round(alpha * 230));
      }

      // 5. Dashed Concentric Ring & Cardinal Nodes (at rSafe * 0.58)
      const ring2R = rSafe * 0.58;
      const distToRing2 = Math.abs(d - ring2R);
      if (distToRing2 < ring1Width) {
        const isDash = (Math.floor(angle / 5) % 2 === 0);
        if (isDash) {
          const alpha = (1 - distToRing2 / ring1Width) * 0.85;
          r = Math.round(r * (1 - alpha) + 129 * alpha);
          g = Math.round(g * (1 - alpha) + 140 * alpha);
          b = Math.round(b * (1 - alpha) + 248 * alpha);
          a = Math.max(a, Math.round(alpha * 220));
        }
      }

      // 8 Cardinal / Ordinal Micro-Nodes (at rSafe * 0.58, every 45 deg)
      for (let i = 0; i < 8; i++) {
        const nodeAngle = (i * 45) * Math.PI / 180;
        const nx = cx + ring2R * Math.cos(nodeAngle);
        const ny = cy + ring2R * Math.sin(nodeAngle);
        const distToNode = Math.hypot(x - nx, y - ny);
        const nodeRadius = Math.max(1.8, size * 0.02);
        if (distToNode < nodeRadius) {
          const alpha = 1 - distToNode / nodeRadius;
          r = Math.round(r * (1 - alpha) + 56 * alpha);
          g = Math.round(g * (1 - alpha) + 189 * alpha);
          b = Math.round(b * (1 - alpha) + 248 * alpha);
          a = Math.max(a, Math.round(alpha * 255));
        }
      }

      // 6. Sacred Shatkona (Interlocking Triangles at rSafe * 0.44)
      const triR = rSafe * 0.44;
      // Triangle 1: pointing north (apex at angle 270 / -90)
      const t1y = dy + triR * 0.5;
      const t1x = Math.abs(dx);
      // Distance to equilateral sides:
      const dSide1 = Math.abs(t1x * 0.866 + dy * 0.5 - triR * 0.5);
      const dSide2 = Math.abs(-t1x * 0.866 + dy * 0.5 - triR * 0.5);
      const dBase1 = Math.abs(dy - triR * 0.5);
      const isInsideT1 = (dy <= triR * 0.5) && (t1x * 1.732 - dy <= triR);

      // Triangle 2: pointing south (apex at angle 90)
      const isInsideT2 = (dy >= -triR * 0.5) && (t1x * 1.732 + dy <= triR);

      // Subtle Shatkona Inner Fill
      if (isInsideT1 && isInsideT2) {
        const fillAlpha = 0.22;
        r = Math.round(r * (1 - fillAlpha) + 99 * fillAlpha);
        g = Math.round(g * (1 - fillAlpha) + 102 * fillAlpha);
        b = Math.round(b * (1 - fillAlpha) + 241 * fillAlpha);
        a = Math.max(a, Math.round(fillAlpha * 255));
      }

      // Shatkona Lines
      const triLineWidth = Math.max(1.4, size * 0.015);
      const lineDist1 = Math.min(dSide1, dSide2, dBase1);
      if (lineDist1 < triLineWidth && isInsideT1) {
        const alpha = 1 - lineDist1 / triLineWidth;
        r = Math.round(r * (1 - alpha) + 99 * alpha);
        g = Math.round(g * (1 - alpha) + 102 * alpha);
        b = Math.round(b * (1 - alpha) + 241 * alpha);
        a = Math.max(a, Math.round(alpha * 230));
      }

      const dSide3 = Math.abs(t1x * 0.866 - dy * 0.5 - triR * 0.5);
      const dSide4 = Math.abs(-t1x * 0.866 - dy * 0.5 - triR * 0.5);
      const dBase2 = Math.abs(dy + triR * 0.5);
      const lineDist2 = Math.min(dSide3, dSide4, dBase2);
      if (lineDist2 < triLineWidth && isInsideT2) {
        const alpha = 1 - lineDist2 / triLineWidth;
        r = Math.round(r * (1 - alpha) + 168 * alpha);
        g = Math.round(g * (1 - alpha) + 85 * alpha);
        b = Math.round(b * (1 - alpha) + 247 * alpha);
        a = Math.max(a, Math.round(alpha * 230));
      }

      // 7. Concentric Inner Glowing Rings (at rSafe * 0.26 and rSafe * 0.16)
      const ring3R = rSafe * 0.26;
      const distToRing3 = Math.abs(d - ring3R);
      if (distToRing3 < triLineWidth) {
        const alpha = 1 - distToRing3 / triLineWidth;
        r = Math.round(r * (1 - alpha) + 56 * alpha);
        g = Math.round(g * (1 - alpha) + 189 * alpha);
        b = Math.round(b * (1 - alpha) + 248 * alpha);
        a = Math.max(a, Math.round(alpha * 240));
      }

      const ring4R = rSafe * 0.16;
      const distToRing4 = Math.abs(d - ring4R);
      if (distToRing4 < triLineWidth) {
        const alpha = 1 - distToRing4 / triLineWidth;
        r = Math.round(r * (1 - alpha) + 192 * alpha);
        g = Math.round(g * (1 - alpha) + 132 * alpha);
        b = Math.round(b * (1 - alpha) + 252 * alpha);
        a = Math.max(a, Math.round(alpha * 240));
      }

      // 8. Central Bindu Diamond Core (at d < rSafe * 0.08)
      const manhattan = Math.abs(dx) + Math.abs(dy);
      const diamondRadius = rSafe * 0.08;
      if (manhattan <= diamondRadius) {
        const alpha = 1;
        r = 56; g = 189; b = 248; // #38bdf8
        a = 255;
      }

      // Central Pure White Radiance Dot
      if (d <= rSafe * 0.035) {
        r = 255; g = 255; b = 255;
        a = 255;
      }

      buffer[idx] = r;
      buffer[idx + 1] = g;
      buffer[idx + 2] = b;
      buffer[idx + 3] = a;
    }
  }

  return encodePng(size, size, buffer);
}

export function generateAllAndroidIcons(rootDir = process.cwd()) {
  const mipmaps = [
    { dir: 'mipmap-mdpi', iconSize: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', iconSize: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', iconSize: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', iconSize: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', iconSize: 192, fgSize: 432 }
  ];

  const resDir = path.resolve(rootDir, 'android/app/src/main/res');

  const generatedFiles = [];

  for (const m of mipmaps) {
    const targetDir = path.join(resDir, m.dir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Standard Launcher Icon (Square with subtle rounded corner)
    const iconPng = renderChakraIcon(m.iconSize, 'square');
    const iconPath = path.join(targetDir, 'ic_launcher.png');
    fs.writeFileSync(iconPath, iconPng);
    generatedFiles.push(iconPath);

    // 2. Round Launcher Icon (Masked circular)
    const roundPng = renderChakraIcon(m.iconSize, 'round');
    const roundPath = path.join(targetDir, 'ic_launcher_round.png');
    fs.writeFileSync(roundPath, roundPng);
    generatedFiles.push(roundPath);

    // 3. Adaptive Foreground Icon (Transparent backdrop, safe-zone sized)
    const fgPng = renderChakraIcon(m.fgSize, 'foreground');
    const fgPath = path.join(targetDir, 'ic_launcher_foreground.png');
    fs.writeFileSync(fgPath, fgPng);
    generatedFiles.push(fgPath);
  }

  // Also write PWA 192 and 512 icons into public/ for PWA consistency
  const publicDir = path.resolve(rootDir, 'public');
  if (fs.existsSync(publicDir)) {
    const pwa192 = renderChakraIcon(192, 'square');
    fs.writeFileSync(path.join(publicDir, 'icon-192.png'), pwa192);
    generatedFiles.push(path.join(publicDir, 'icon-192.png'));

    const pwa512 = renderChakraIcon(512, 'square');
    fs.writeFileSync(path.join(publicDir, 'icon-512.png'), pwa512);
    generatedFiles.push(path.join(publicDir, 'icon-512.png'));
  }

  return generatedFiles;
}

import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

export function createRasterCanvas(width, height, scale) {
  return {
    width: width * scale,
    height: height * scale,
    scale,
    pixels: new Uint8ClampedArray(width * scale * height * scale * 4),
  };
}

export function fill(canvas, points, color, opacity = 1) {
  const scaled = points.map(([x, y]) => [x * canvas.scale, y * canvas.scale]);
  const xs = scaled.map(([x]) => x);
  const ys = scaled.map(([, y]) => y);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(...ys)));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (insidePolygon(x + 0.5, y + 0.5, scaled)) {
        blend(canvas, x, y, color, opacity);
      }
    }
  }
}

export function stroke(canvas, points, color, width, opacity = 1) {
  const scaled = points.map(([x, y]) => [x * canvas.scale, y * canvas.scale]);
  const radius = (width * canvas.scale) / 2;
  for (let index = 0; index < scaled.length - 1; index += 1) {
    const [x1, y1] = scaled[index];
    const [x2, y2] = scaled[index + 1];
    const minX = Math.max(0, Math.floor(Math.min(x1, x2) - radius - 1));
    const maxX = Math.min(canvas.width - 1, Math.ceil(Math.max(x1, x2) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(y1, y2) - radius - 1));
    const maxY = Math.min(canvas.height - 1, Math.ceil(Math.max(y1, y2) + radius + 1));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (distanceToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2) <= radius) {
          blend(canvas, x, y, color, opacity);
        }
      }
    }
  }
}

export function downsample(canvas) {
  const width = canvas.width / canvas.scale;
  const height = canvas.height / canvas.scale;
  const output = new Uint8Array(width * height * 4);
  const samples = canvas.scale * canvas.scale;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let alphaSum = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = 0; sy < canvas.scale; sy += 1) {
        for (let sx = 0; sx < canvas.scale; sx += 1) {
          const srcIndex = (((y * canvas.scale + sy) * canvas.width) + (x * canvas.scale + sx)) * 4;
          const alpha = canvas.pixels[srcIndex + 3] / 255;
          alphaSum += alpha;
          rSum += canvas.pixels[srcIndex] * alpha;
          gSum += canvas.pixels[srcIndex + 1] * alpha;
          bSum += canvas.pixels[srcIndex + 2] * alpha;
        }
      }
      const alpha = alphaSum / samples;
      const outIndex = (y * width + x) * 4;
      output[outIndex] = alphaSum > 0 ? Math.round(rSum / alphaSum) : 0;
      output[outIndex + 1] = alphaSum > 0 ? Math.round(gSum / alphaSum) : 0;
      output[outIndex + 2] = alphaSum > 0 ? Math.round(bSum / alphaSum) : 0;
      output[outIndex + 3] = Math.round(alpha * 255);
    }
  }

  return output;
}

export function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function hexToRgb(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

export function lighten(color, amount) {
  return color.map((channel) => clampByte(channel + amount));
}

export function darken(color, amount) {
  return color.map((channel) => clampByte(channel - amount));
}

export function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hashNoise(x, y) {
  let hash = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  hash = (hash ^ (hash >>> 13)) >>> 0;
  hash = Math.imul(hash, 1274126177) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function blend(canvas, x, y, [sr, sg, sb], opacity) {
  const index = (y * canvas.width + x) * 4;
  const srcA = Math.max(0, Math.min(1, opacity));
  const dstA = canvas.pixels[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return;
  }
  canvas.pixels[index] = Math.round((sr * srcA + canvas.pixels[index] * dstA * (1 - srcA)) / outA);
  canvas.pixels[index + 1] = Math.round((sg * srcA + canvas.pixels[index + 1] * dstA * (1 - srcA)) / outA);
  canvas.pixels[index + 2] = Math.round((sb * srcA + canvas.pixels[index + 2] * dstA * (1 - srcA)) / outA);
  canvas.pixels[index + 3] = Math.round(outA * 255);
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

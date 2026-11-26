/**
 * Hardened Client-Side Visual PII Redaction Engine (HTML5 Canvas)
 *
 * Security invariants enforced:
 * 1. Strict raster-only upload validation (MIME allowlist + binary magic bytes + 5 MB size cap).
 *    Rejects SVG/HTML/arbitrary payloads that could carry scripts or vector bombs.
 * 2. Mandatory Canvas re-encoding (even with 0 boxes) -> strips 100% of EXIF/GPS/IPTC metadata.
 * 3. Proportional downscaling to max 2048px -> eliminates Canvas OOM memory bombs.
 * 4. Clamped normalized boxes, try/catch + decode timeout -> Fail-closed (never silently leaks raw image).
 */

import {
  ALLOWED_IMAGE_MIMES,
  clampFinite,
  detectImageMimeFromBytes,
  MAX_IMAGE_CANVAS_DIM,
  MAX_IMAGE_DATAURL_BYTES,
  MAX_IMAGE_FILE_BYTES,
  parseSafeImageDataUrl,
  sanitizePlainText,
} from './securityUtils.js';

const MAX_PREDECODE_DIM = 12000;
const MAX_PREDECODE_PIXELS = 64_000_000; // 64 MP cap rejects pixel-flood PNG bombs before decode

export const REDACTION_PRESETS = [
  {
    id: 'header-and-phone',
    label: 'ปิดหัวบิล (ชื่อแอดมิน) + คอลัมน์เบอร์โทร (แนะนำ)',
    boxes: [
      { x: 0.02, y: 0.14, w: 0.96, h: 0.065, tag: 'PDPA · HEADER REDACTED' },
      { x: 0.77, y: 0.21, w: 0.21, h: 0.72, tag: 'PDPA · PHONE REDACTED' },
    ],
  },
  {
    id: 'phone-column',
    label: 'ปิดคอลัมน์เบอร์โทรด้านขวา',
    boxes: [{ x: 0.77, y: 0.21, w: 0.21, h: 0.72, tag: 'PDPA · PHONE REDACTED' }],
  },
  {
    id: 'custom-only',
    label: 'ลากปิดเองบนภาพเท่านั้น (ต้องลากอย่างน้อย 1 จุดก่อนส่ง Cloud)',
    boxes: [],
  },
];

function readPngHeaderDimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 24) return null;
  // IHDR chunk starts at byte 12 ("IHDR"), width at 16..19, height at 20..23 (big-endian)
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

/**
 * Validates an uploaded File object (size, MIME allowlist, binary magic bytes, and PNG IHDR pixel bounds).
 * Returns { ok: true, mime } or { ok: false, error }.
 */
export async function validateUploadedImageFile(file) {
  if (!file || typeof file.size !== 'number') {
    return { ok: false, error: 'ไม่พบไฟล์รูปภาพที่อัปโหลด' };
  }
  if (file.size === 0 || file.size > MAX_IMAGE_FILE_BYTES) {
    return {
      ok: false,
      error: `ขนาดไฟล์ต้องไม่เกิน ${Math.round(MAX_IMAGE_FILE_BYTES / (1024 * 1024))} MB (ป้องกันหน่วยความจำเต็ม)`,
    };
  }
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return {
      ok: false,
      error: 'รองรับเฉพาะไฟล์ภาพ PNG, JPEG หรือ WebP เท่านั้น (ไม่อนุญาต SVG หรือไฟล์ชนิดอื่น)',
    };
  }

  try {
    const headerBuf = await file.slice(0, 32).arrayBuffer();
    const headerBytes = new Uint8Array(headerBuf);
    const detectedMime = detectImageMimeFromBytes(headerBytes);
    if (!detectedMime || !ALLOWED_IMAGE_MIMES.has(detectedMime)) {
      return {
        ok: false,
        error: 'โครงสร้างไบต์ของไฟล์ไม่ตรงกับภาพ PNG/JPEG/WebP จริง — ปฏิเสธการอัปโหลดเพื่อความปลอดภัย',
      };
    }

    if (detectedMime === 'image/png') {
      const dims = readPngHeaderDimensions(headerBytes);
      if (
        dims &&
        (dims.width === 0 ||
          dims.height === 0 ||
          dims.width > MAX_PREDECODE_DIM ||
          dims.height > MAX_PREDECODE_DIM ||
          dims.width * dims.height > MAX_PREDECODE_PIXELS)
      ) {
        return {
          ok: false,
          error: 'ความละเอียดของไฟล์ภาพสูงผิดปกติ (ป้องกันภาพขยายหน่วยความจำเกินขีดจำกัด)',
        };
      }
    }

    return { ok: true, mime: detectedMime };
  } catch {
    return { ok: false, error: 'ไม่สามารถตรวจสอบโครงสร้างไฟล์ภาพได้' };
  }
}

/**
 * Renders an image onto an offscreen canvas with bounded dimensions (stripping all EXIF/GPS metadata),
 * burns solid opaque blackout bars over all active redaction boxes, and returns a clean Data URL.
 */
export function applyVisualRedaction(rawImageDataUrl, boxes = []) {
  return new Promise((resolve, reject) => {
    if (!rawImageDataUrl) {
      resolve(null);
      return;
    }

    const parsed = parseSafeImageDataUrl(rawImageDataUrl);
    if (!parsed) {
      reject(new Error('Invalid or unsupported image Data URL'));
      return;
    }

    const img = new Image();
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Image decode timed out'));
      }
    }, 8000);

    const finishOk = (val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(val);
    };

    const finishErr = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(err instanceof Error ? err : new Error('Visual redaction failed'));
    };

    img.onload = () => {
      try {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH || srcW <= 0 || srcH <= 0) {
          finishErr(new Error('Invalid image dimensions'));
          return;
        }

        // Proportionally downscale to MAX_IMAGE_CANVAS_DIM to prevent Canvas OOM bombs
        const scale = Math.min(1, MAX_IMAGE_CANVAS_DIM / Math.max(srcW, srcH));
        const targetW = Math.max(1, Math.round(srcW * scale));
        const targetH = Math.max(1, Math.round(srcH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finishErr(new Error('Canvas 2D context unavailable'));
          return;
        }

        // Drawing onto fresh canvas strips 100% of EXIF/GPS/IPTC/XMP metadata
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const safeBoxes = Array.isArray(boxes) ? boxes.slice(0, 50) : [];
        for (const box of safeBoxes) {
          if (!box || typeof box !== 'object') continue;
          const nx = clampFinite(box.x, 0, 1, 0);
          const ny = clampFinite(box.y, 0, 1, 0);
          const nw = clampFinite(box.w, 0, 1 - nx, 0);
          const nh = clampFinite(box.h, 0, 1 - ny, 0);
          if (nw <= 0 || nh <= 0) continue;

          const bx = Math.round(nx * targetW);
          const by = Math.round(ny * targetH);
          const bw = Math.round(nw * targetW);
          const bh = Math.round(nh * targetH);

          // Solid opaque dark pine-charcoal blackout (zero pixel leakage)
          ctx.fillStyle = '#0b1913';
          ctx.fillRect(bx, by, bw, bh);

          // Crisp border + PDPA stamp inside box
          ctx.strokeStyle = '#6ee7b7';
          ctx.lineWidth = Math.max(1.5, targetW * 0.002);
          ctx.strokeRect(bx + 1, by + 1, Math.max(0, bw - 2), Math.max(0, bh - 2));

          if (bw > 60 && bh > 22) {
            ctx.save();
            ctx.fillStyle = '#6ee7b7';
            const fontSize = Math.max(10, Math.min(13, Math.round(bw * 0.085)));
            ctx.font = `bold ${fontSize}px "IBM Plex Sans Thai", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = sanitizePlainText(box.tag, { maxLen: 28, fallback: 'PDPA REDACTED' });
            if (bh > bw * 1.6) {
              ctx.translate(bx + bw / 2, by + bh / 2);
              ctx.rotate(-Math.PI / 2);
              ctx.fillText(label, 0, 0);
            } else {
              ctx.fillText(label, bx + bw / 2, by + bh / 2);
            }
            ctx.restore();
          }
        }

        let outDataUrl = canvas.toDataURL('image/png');
        // Fallback to high-quality EXIF-stripped JPEG if lossless PNG exceeds payload limit
        if (outDataUrl.length > MAX_IMAGE_DATAURL_BYTES) {
          outDataUrl = canvas.toDataURL('image/jpeg', 0.88);
        }
        canvas.width = 0;
        canvas.height = 0;
        finishOk(outDataUrl);
      } catch (err) {
        finishErr(err);
      }
    };

    img.onerror = () => finishErr(new Error('Failed to decode image'));
    img.src = rawImageDataUrl;
  });
}

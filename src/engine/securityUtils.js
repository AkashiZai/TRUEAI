/**
 * Shared Security & Input-Sanitization Utilities for GreenRoute AI
 * Enforces deterministic bounds, strict types, magic-byte file verification,
 * and plain-text/control-character sanitization at every trust boundary.
 */

export const MAX_RAW_CHAT_CHARS = 25000;
export const MAX_ORDERS_PER_BATCH = 100;
export const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMAGE_CANVAS_DIM = 2048; // Max width/height (<= ~4.2 MP prevents Canvas OOM)
export const MAX_IMAGE_DATAURL_BYTES = 8 * 1024 * 1024; // 8 MB base64 ceiling

export const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const ALLOWED_GEMINI_MODELS = new Set(['gemini-2.5-flash', 'gemini-2.0-flash']);

const NEWLINE_RE = /[\r\n\u2028\u2029]+/g;

function stripControlAndBidiChars(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    const isC0Control =
      (c >= 0x00 && c <= 0x08) ||
      c === 0x0b ||
      c === 0x0c ||
      (c >= 0x0e && c <= 0x1f) ||
      (c >= 0x7f && c <= 0x9f);
    const isBidiOverride = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
    if (!isC0Control && !isBidiOverride) {
      out += str[i];
    }
  }
  return out;
}

/**
 * Coerces an untrusted value to a safe bounded plain-text string.
 * Rejects non-primitive objects/arrays to prevent React render crashes or "[object Object]".
 */
export function sanitizePlainText(
  val,
  { maxLen = 120, singleLine = true, trim = true, fallback = '' } = {}
) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') {
    return fallback;
  }
  let s = stripControlAndBidiChars(String(val));
  if (singleLine) {
    s = s.replace(NEWLINE_RE, ' ');
    if (trim) s = s.replace(/\s{2,}/g, ' ');
  }
  if (trim) s = s.trim();
  if (!s && trim) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Sanitizes untrusted text interpolated into driver LINE dispatch messages.
 * Strips newlines and neutralizes external URL schemes to prevent link spoofing.
 */
export function sanitizeDriverField(val, maxLen = 80, fallback = '-') {
  const clean = sanitizePlainText(val, { maxLen, singleLine: true, fallback });
  return clean.replace(/(?:https?:\/\/|javascript:|data:|vbscript:)/gi, '[link-removed] ');
}

/**
 * Enforces a finite numeric value clamped strictly to [min, max].
 * Explicitly rejects null, empty/whitespace strings, and booleans (prevents Number(null) === 0 bugs).
 */
export function clampFinite(val, min, max, fallback) {
  if (val === null || val === undefined || typeof val === 'boolean') return fallback;
  if (typeof val === 'string' && val.trim() === '') return fallback;
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Validates latitude and longitude bounds.
 */
export function isValidCoordinate(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Validates strict 6-digit hex color strings for safe style injection.
 */
export function safeHexColor(color, fallback = '#0f5132') {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

/**
 * Cryptographically random lowercase hex string (browser & Node 19+ WebCrypto).
 */
export function generateRandomHex(byteCount = 4) {
  const bytes = new Uint8Array(byteCount);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteCount; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a unique order identifier without Date.now() 1ms collisions.
 */
export function generateOrderId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `ord-${globalThis.crypto.randomUUID().slice(0, 12)}`;
  }
  return `ord-${Date.now()}-${generateRandomHex(4)}`;
}

/**
 * Verifies real binary image headers (magic bytes) so renamed SVGs/HTML/scripts
 * cannot masquerade as PNG/JPEG/WebP uploads.
 */
export function detectImageMimeFromBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates that a Data URL uses an allowed raster image MIME type and safe size.
 */
export function parseSafeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_IMAGE_DATAURL_BYTES) {
    return null;
  }
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1 || commaIdx > 64) return null;
  const header = dataUrl.slice(0, commaIdx);
  const base64 = dataUrl.slice(commaIdx + 1);
  const match = header.match(/^data:(image\/(?:png|jpeg|webp));base64$/);
  if (!match) return null;
  if (!base64 || base64.length < 16 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return null;
  }
  return { mimeType: match[1], data: base64.replace(/\s+/g, '') };
}

/**
 * Strips trailing characters matching a character set in strict O(N) linear time
 * (immune to polynomial ReDoS from unanchored trailing quantifiers).
 */
export function trimTrailingChars(str, charSet) {
  let end = str.length;
  while (end > 0 && charSet.has(str[end - 1])) {
    end--;
  }
  return str.slice(0, end);
}

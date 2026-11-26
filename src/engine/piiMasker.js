/**
 * Hardened PDPA PII Masking Engine (AI Ethics & Data Privacy Guardrail)
 *
 * Security invariants enforced:
 * 1. Per-batch cryptographic nonce tokens + pre-masking literal sanitization + fail-closed
 *    per-line vault scoping + allowedTypes allowlist (default: PERSON only).
 *    -> Prevents cross-customer PII vault spoofing even under LLM prompt injection.
 * 2. Full Thai PII coverage: Thai digits (๐-๙), +66 / +66(0) / spaced-dash / provincial phones,
 *    13-digit Thai National/Tax IDs, Thai bank/PromptPay accounts, Emails, personal LINE IDs,
 *    and Thai/English personal honorifics + surnames (case-insensitive).
 * 3. Strictly bounded linear-time O(N) regexes -> Zero quadratic ReDoS.
 * 4. Overlap-resolved phone extraction -> National ID / Bank digits never leak into order.phone.
 */

import { generateRandomHex, MAX_RAW_CHAT_CHARS } from './securityUtils.js';

const THAI_DIGIT_MAP = {
  '๐': '0',
  '๑': '1',
  '๒': '2',
  '๓': '3',
  '๔': '4',
  '๕': '5',
  '๖': '6',
  '๗': '7',
  '๘': '8',
  '๙': '9',
};

const NON_SURNAME_PREFIXES = [
  'สั่ง',
  'ส่ง',
  'โทร',
  'ซอย',
  'ถนน',
  'น้ำ',
  'กล่อง',
  'ลัง',
  'ผัก',
  'เนื้อ',
  'หมู',
  'ไก่',
  'อาหาร',
  'ของสด',
  'สินค้า',
  'ก่อน',
  'ด่วน',
  'ช่วง',
  'ประมาณ',
  'เวลา',
  'ติดต่อ',
  'เอา',
  'รับ',
  'ร้าน',
  'คลัง',
  'สาขา',
  'สุขุมวิท',
  'อารีย์',
  'สีลม',
  'รัชดา',
  'ลาดพร้าว',
  'ทองหล่อ',
  'เอกมัย',
  'อ่อนนุช',
  'คลองเตย',
  'สามย่าน',
  'บางนา',
  'พระราม',
  'ดอนเมือง',
  'สำโรง',
  'ปากน้ำ',
  'พญาไท',
  'ปิ่นเกล้า',
  'บางแค',
  'รามคำแหง',
  'แจ้งวัฒนะ',
  'งามวงศ์วาน',
  'อุดมสุข',
  'กิ่งแก้ว',
  'ลาดกระบัง',
  'ศรีนครินทร์',
  'เทพารักษ์',
  'แบริ่ง',
  'โซดา',
  'เครื่องดื่ม',
  'วัตถุดิบ',
];

const STRAY_TOKEN_RE = /\[(?:PII:[a-f0-9]+:)?(?:PHONE|CONTACT|PERSON|ID|BANK)_\d{1,4}(?:#[a-f0-9]+)?\]/gi;

function normalizeThaiDigits(str) {
  return str.replace(/[๐-๙]/g, (ch) => THAI_DIGIT_MAP[ch] || ch);
}

const HONORIFIC_WORDS = new Set(['คุณ', 'นาย', 'นาง', 'นางสาว', 'น.ส.', 'ดร.', 'khun', 'mr', 'mrs', 'ms']);

function isOrderOrAreaKeyword(word) {
  const w = word.toLowerCase();
  return HONORIFIC_WORDS.has(w) || NON_SURNAME_PREFIXES.some((kw) => w.startsWith(kw));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applySpanReplacements(line, spans, makeToken) {
  if (spans.length === 0) return line;
  // Sort by start ascending, priority/length descending so ID & BANK beat PHONE overlaps
  const priority = { ID: 4, BANK: 3, PHONE: 2, CONTACT: 2, PERSON: 1 };
  spans.sort(
    (a, b) =>
      a.start - b.start ||
      (priority[b.type] || 0) - (priority[a.type] || 0) ||
      b.end - a.end
  );
  const nonOverlapping = [];
  let cursor = 0;
  for (const sp of spans) {
    if (sp.start >= cursor && sp.end > sp.start) {
      nonOverlapping.push(sp);
      cursor = sp.end;
    }
  }

  let out = '';
  let pos = 0;
  for (const sp of nonOverlapping) {
    out += line.slice(pos, sp.start);
    const original = line.slice(sp.start, sp.end);
    const token = makeToken(sp.type, original);
    out += token;
    pos = sp.end;
  }
  out += line.slice(pos);
  return out;
}

/**
 * Masks PII line-by-line with a per-run cryptographic nonce and per-line vault scoping.
 */
export function maskPII(rawInput = '') {
  const rawText = typeof rawInput === 'string' ? rawInput.slice(0, MAX_RAW_CHAT_CHARS) : '';
  const nonce = generateRandomHex(4);
  const vault = [];
  const linePhones = [];

  const counters = {
    ID: 1,
    BANK: 1,
    PHONE: 1,
    CONTACT: 1,
    PERSON: 1,
  };

  // Neutralize any pre-existing forged placeholder tokens before masking
  const sanitizedLines = rawText.split(/\r?\n/).map((line) =>
    line.replace(STRAY_TOKEN_RE, '(redacted-token)')
  );

  const maskedLines = sanitizedLines.map((line, lineIndex) => {
    const digitNorm = normalizeThaiDigits(line);
    const spans = [];
    let firstPhoneOnLine = null;

    // 1. Thai 13-digit National Citizen ID / Tax ID (e.g., 1-1007-00123-45-6 or 1100700123456)
    const idRe = /(?<!\d)(?:\d[-.\s]\d{4}[-.\s]\d{5}[-.\s]\d{2}[-.\s]\d|\d{13})(?!\d)/g;
    for (const m of digitNorm.matchAll(idRe)) {
      spans.push({ start: m.index, end: m.index + m[0].length, type: 'ID' });
    }

    // 2. Thai Bank Account / PromptPay Numbers (bounded whitespace -> zero ReDoS)
    const bankDashRe = /(?<!\d)\d{3}-\d-\d{5}-\d(?!\d)/g;
    for (const m of digitNorm.matchAll(bankDashRe)) {
      spans.push({ start: m.index, end: m.index + m[0].length, type: 'BANK' });
    }
    const bankPrefixedRe =
      /(?:บช\.?(?:ออมทรัพย์|กระแสรายวัน)?|บัญชี(?:ออมทรัพย์|กระแสรายวัน)?|พร้อมเพย์|promptpay|กสิกรไทย|กสิกร|กรุงไทย|ไทยพาณิชย์|กรุงเทพ|กรุงศรี|ttb|scb|kbank|bbl)[ \t]{0,3}(?:[:：-][ \t]{0,3})?(\d(?:[-.\s]?\d){9,12})(?!\d)/gi;
    for (const m of digitNorm.matchAll(bankPrefixedRe)) {
      const digits = m[1].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 13) {
        const numStart = m.index + m[0].lastIndexOf(m[1]);
        spans.push({ start: numStart, end: numStart + m[1].length, type: 'BANK' });
      }
    }

    // 3. Thai & International Phone Numbers (+66, +66(0), 0[2-9], (089)/(02), spaced dashes, Thai digits)
    const phoneRe =
      /(?<!\d)(?:\+?66[ \t]{0,2}[-.]?[ \t]{0,2}(?:\(0\)[ \t]{0,2}[-.]?[ \t]{0,2})?[2-9]|\(0[2-9]\d?\)|0[2-9])(?:[ \t]{0,2}[-.\s]?[ \t]{0,2}\d){6,8}(?!\d)/g;
    for (const m of digitNorm.matchAll(phoneRe)) {
      const digitsOnly = m[0].replace(/\D/g, '');
      const validThaiPhone =
        (digitsOnly.startsWith('660') && (digitsOnly.length === 11 || digitsOnly.length === 12)) ||
        (digitsOnly.startsWith('66') && (digitsOnly.length === 10 || digitsOnly.length === 11)) ||
        (digitsOnly.startsWith('02') && (digitsOnly.length === 9 || digitsOnly.length === 10)) ||
        (digitsOnly.startsWith('0') && (digitsOnly.length === 9 || digitsOnly.length === 10));
      if (validThaiPhone) {
        spans.push({ start: m.index, end: m.index + m[0].length, type: 'PHONE' });
      }
    }

    // 4. Emails & @handles (linear-time non-overlapping domain labels, guarded by '@')
    if (line.includes('@')) {
      const emailRe =
        /(?<![a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9-]{1,63}(?:\.[a-zA-Z0-9-]{1,63}){1,6}/g;
      for (const m of line.matchAll(emailRe)) {
        spans.push({ start: m.index, end: m.index + m[0].length, type: 'CONTACT' });
      }
      const atHandleRe = /(?<![a-zA-Z0-9._%+-])@[a-zA-Z0-9._-]{3,32}/g;
      for (const m of line.matchAll(atHandleRe)) {
        spans.push({ start: m.index, end: m.index + m[0].length, type: 'CONTACT' });
      }
    }

    // 5. Personal LINE IDs without '@' (bounded whitespace -> zero ReDoS)
    const lineIdRe =
      /(?:line[ \t]{0,2}id|id[ \t]{0,2}line|ไอดีไลน์|ไลน์ไอดี)[ \t]{0,3}(?:[:：=][ \t]{0,3})?([a-zA-Z0-9._-]{3,32})/gi;
    for (const m of line.matchAll(lineIdRe)) {
      const idStart = m.index + m[0].lastIndexOf(m[1]);
      spans.push({ start: idStart, end: idStart + m[1].length, type: 'CONTACT' });
    }

    // 6. Personal Names with Thai/English honorifics (case-insensitive, stops before next honorific/keyword)
    const personRe =
      /(?:คุณ|นาย|นางสาว|นาง|น\.ส\.|ดร\.|\bKhun\b|\bMr\.?|\bMrs\.?|\bMs\.?)[ \t]{0,2}([ก-๙a-zA-Z]{2,35})(?:[ \t]+(?!(?:คุณ|นาย|นางสาว|นาง|น\.ส\.|ดร\.|khun\b|mr\.?\b|mrs\.?\b|ms\.?\b))([ก-๙a-zA-Z]{2,35}))?/gi;
    for (const m of line.matchAll(personRe)) {
      const firstName = m[1];
      const maybeSurname = m[2];
      if (isOrderOrAreaKeyword(firstName)) continue;

      let endIdx = m.index + m[0].length;
      if (maybeSurname && isOrderOrAreaKeyword(maybeSurname)) {
        endIdx = m.index + m[0].lastIndexOf(maybeSurname);
        while (endIdx > m.index && (line[endIdx - 1] === ' ' || line[endIdx - 1] === '\t')) {
          endIdx--;
        }
      }
      spans.push({ start: m.index, end: endIdx, type: 'PERSON' });
    }

    const maskedLine = applySpanReplacements(line, spans, (type, original) => {
      // Capture line phone ONLY after overlap resolution guarantees ID/BANK spans won
      if (type === 'PHONE' && !firstPhoneOnLine) {
        firstPhoneOnLine = original;
      }
      const idxStr = String(counters[type]++).padStart(2, '0');
      const token = `[${type}_${idxStr}#${nonce}]`;
      vault.push({ token, type, original, lineIndex });
      return token;
    });

    linePhones.push(firstPhoneOnLine || '-');
    return maskedLine;
  });

  const maskedText = maskedLines.join('\n');

  return {
    rawText,
    maskedText,
    nonce,
    vault,
    linePhones,
    maskedCount: vault.length,
  };
}

/**
 * Restores masked PII tokens locally in a single non-recursive pass.
 * FAIL-CLOSED security contract:
 * - Requires a valid integer `allowedLineIndex` (returns text with stray tokens stripped if invalid/null).
 * - Restricts restored token types via `allowedTypes` (default: ['PERSON'] only so ID/BANK/PHONE never
 *   leak into shop names, map popups, or addresses).
 */
export function unmaskString(
  text = '',
  vault = [],
  allowedLineIndex = -1,
  { allowedTypes = ['PERSON'], stripUnresolved = true } = {}
) {
  const input = typeof text === 'string' ? text : String(text || '');
  if (!input) return input;

  let result = input;
  if (Number.isInteger(allowedLineIndex) && allowedLineIndex >= 0 && Array.isArray(vault) && vault.length > 0) {
    const allowedSet = new Set(allowedTypes);
    const lookup = new Map();
    for (const entry of vault) {
      if (!entry || typeof entry.token !== 'string') continue;
      if (entry.lineIndex !== allowedLineIndex) continue;
      if (!allowedSet.has(entry.type)) continue;
      lookup.set(entry.token, entry.original);
    }

    if (lookup.size > 0) {
      const pattern = new RegExp(
        Array.from(lookup.keys(), (k) => escapeRegExp(k)).join('|'),
        'g'
      );
      result = result.replace(pattern, (matched) => lookup.get(matched) ?? matched);
    }
  }

  if (stripUnresolved) {
    result = result.replace(STRAY_TOKEN_RE, '').replace(/\s{2,}/g, ' ').trim();
  }
  return result;
}

/**
 * Strips all detected PII into static [REDACTED] markers for external B2B ESG JSON exports.
 */
export function stripPIIForExport(text = '') {
  const report = maskPII(typeof text === 'string' ? text : String(text || ''));
  return report.maskedText.replace(STRAY_TOKEN_RE, '[REDACTED]');
}

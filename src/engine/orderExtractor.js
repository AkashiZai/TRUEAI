import { matchBangkokLocation } from '../data/bangkokLocations.js';
import { maskPII, unmaskString } from './piiMasker.js';

/**
 * Hybrid Order Extraction Engine
 * 1) Primary: Google Gemini 2.5 Flash / 2.0 Flash REST API (Text & Multimodal Image OCR)
 * 2) Automatic Failover: Offline Smart Fallback Thai NLP Parser (Rate-Limit & Network Safe)
 */

const SYSTEM_PROMPT = `You are a Thai SME logistics order parser for GreenRoute AI.
Extract delivery orders from messy Thai LINE chat messages or delivery slip images into a strict JSON array.
Each item MUST have:
- customerName: string (shop or customer name; preserve any [PERSON_xx] tokens if present)
- addressText: string (district, road, soi, or landmark in Bangkok/Thailand)
- itemsSummary: string (short description of goods)
- weightKg: number (weight in kg; if given in packs/boxes without kg, estimate realistically: 1 pack water ~12kg, 1 box ~15kg)
- timeStart: string ("HH:MM" 24-hour format, default "08:00")
- timeEnd: string ("HH:MM" 24-hour format, default "16:00")
- confidence: integer (60-99; lower below 82 if weight was estimated/vague or address is incomplete)
- reviewReason: string (empty string if confidence >= 85; concise Thai note explaining what admin should verify if < 85)
Return ONLY valid JSON: { "orders": [ ... ] }`;

/**
 * Main extraction entry point with automatic Gemini -> Offline Smart Fallback failover.
 */
export async function extractOrdersHybrid({
  rawText = '',
  imageDataUrl = null,
  fallbackPresetText = '',
  apiKey = '',
  model = 'gemini-2.5-flash',
  forceOffline = false,
}) {
  const startedAt = performance.now();
  const effectiveText = rawText.trim() || fallbackPresetText.trim();
  const piiReport = maskPII(effectiveText);

  const cleanKey = (apiKey || import.meta.env.VITE_GEMINI_API_KEY || '').trim();

  // Case 1: User forced offline mode OR no API key provided -> Offline Smart Fallback directly
  if (forceOffline || !cleanKey) {
    const orders = parseOrdersOffline(effectiveText, piiReport.vault, Boolean(imageDataUrl));
    return {
      orders,
      piiReport,
      telemetry: {
        mode: 'offline-fallback',
        engineLabel: forceOffline
          ? 'Offline Smart Fallback (Safe Demo Mode)'
          : 'Offline Smart Fallback (No API Key)',
        fallbackReason: forceOffline
          ? 'เปิดโหมด Offline Safe Demo ไว้เพื่อความเสถียรระหว่างนำเสนอ'
          : 'ยังไม่ได้ใส่ Gemini API Key — ใช้ตัวแกะภาษาไทย Offline Smart Fallback อัตโนมัติ',
        latencyMs: Math.max(18, Math.round(performance.now() - startedAt)),
        usedImage: Boolean(imageDataUrl),
        modelUsed: 'Thai-NLP-Heuristic-v2',
      },
    };
  }

  // Case 2: Try live Google Gemini API with strict timeout & 429/error auto-fallback
  try {
    const geminiOrders = await callGeminiAPI({
      maskedText: piiReport.maskedText,
      imageDataUrl,
      apiKey: cleanKey,
      model,
    });

    if (!geminiOrders || geminiOrders.length === 0) {
      throw new Error('Gemini returned empty orders array');
    }

    const normalized = geminiOrders.map((item, idx) => {
      const unmaskedName = unmaskString(item.customerName || `ลูกค้า #${idx + 1}`, piiReport.vault);
      const unmaskedAddr = unmaskString(item.addressText || '', piiReport.vault);
      const geo = matchBangkokLocation(`${unmaskedAddr} ${unmaskedName}`);
      const phoneMatch = findPhoneForLine(effectiveText, idx);

      const rawConfidence = Number(item.confidence) || 92;
      const finalConfidence = geo.matched ? Math.min(rawConfidence, 99) : Math.min(rawConfidence, 74);
      const reviewReason =
        item.reviewReason ||
        (!geo.matched ? 'พิกัดไม่ชัดเจนในฐานข้อมูล กทม. กรุณาตรวจสอบที่อยู่' : '');

      return {
        id: `ord-${idx + 1}`,
        customerName: unmaskedName,
        addressText: unmaskedAddr || geo.label,
        matchedArea: geo.label,
        itemsSummary: item.itemsSummary || 'สินค้าจัดส่ง',
        weightKg: clampWeight(item.weightKg),
        timeStart: sanitizeTime(item.timeStart, '08:00'),
        timeEnd: sanitizeTime(item.timeEnd, '15:00'),
        phone: phoneMatch || '-',
        lat: geo.lat,
        lng: geo.lng,
        confidence: Math.round(finalConfidence),
        reviewReason,
        verified: finalConfidence >= 85,
      };
    });

    return {
      orders: normalized,
      piiReport,
      telemetry: {
        mode: 'gemini-live',
        engineLabel: `Google ${model} (Live API)`,
        fallbackReason: null,
        latencyMs: Math.round(performance.now() - startedAt),
        usedImage: Boolean(imageDataUrl),
        modelUsed: model,
      },
    };
  } catch (err) {
    // Graceful automatic failover on 429 Rate Limit, Quota Exceeded, 401/403, Timeout, or Offline
    const reason = classifyGeminiError(err);
    const orders = parseOrdersOffline(effectiveText, piiReport.vault, Boolean(imageDataUrl));
    return {
      orders,
      piiReport,
      telemetry: {
        mode: 'offline-fallback',
        engineLabel: 'Offline Smart Fallback (Auto-Failover)',
        fallbackReason: reason,
        latencyMs: Math.round(performance.now() - startedAt),
        usedImage: Boolean(imageDataUrl),
        modelUsed: `${model} -> Fallback`,
        errorCode: err?.status || null,
      },
    };
  }
}

async function callGeminiAPI({ maskedText, imageDataUrl, apiKey, model }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts = [{ text: SYSTEM_PROMPT }];

  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
      parts.push({
        text: 'กรุณาอ่านรายการส่งของจากรูปใบส่งของ/แชตนี้ทั้งหมด และแปลงเป็น JSON ตามรูปแบบที่กำหนด',
      });
    }
  } else {
    parts.push({
      text: `ข้อความแชตสั่งของ (ผ่าน PII Masking แล้ว):\n${maskedText}`,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      const error = new Error(`HTTP ${res.status}: ${errBody.slice(0, 160)}`);
      error.status = res.status;
      throw error;
    }

    const data = await res.json();
    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawJsonText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : parsed.orders || [];
  } finally {
    clearTimeout(timer);
  }
}

function classifyGeminiError(err) {
  if (!err) return 'ไม่สามารถเชื่อมต่อ Gemini API ได้ — สลับเป็น Offline Smart Fallback อัตโนมัติ';
  if (err.name === 'AbortError') {
    return 'Gemini API ตอบสนองช้าเกิน 14 วินาที — สลับเป็น Offline Smart Fallback อัตโนมัติเพื่อไม่ให้ Demo สะดุด';
  }
  if (err.status === 429) {
    return 'Gemini API ติดโควตา/Rate Limit (HTTP 429) — ระบบสลับสู่ Offline Smart Fallback อัตโนมัติทันที';
  }
  if (err.status === 400 || err.status === 401 || err.status === 403) {
    return `Gemini API Key ไม่ถูกต้องหรือไม่มีสิทธิ์ (HTTP ${err.status}) — สลับสู่ Offline Smart Fallback อัตโนมัติ`;
  }
  return `การเชื่อมต่อ Gemini API ขัดข้อง (${err.message || 'Network Error'}) — สลับสู่ Offline Smart Fallback อัตโนมัติ`;
}

/**
 * Deterministic Offline Smart Thai NLP Parser
 * Handles messy Thai LINE messages, unit conversions, Thai time phrases, and geocoding.
 */
export function parseOrdersOffline(rawText = '', vault = [], isImageFallback = false) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4);

  return lines.map((line, idx) => {
    const cleanLine = line.replace(/^\d+[.)]\s*/, '').replace(/^[-•*]\s*/, '').trim();

    // Extract phone number locally (kept on device)
    const phoneMatch = cleanLine.match(/(?:0[689]\d[-.\s]?\d{3}[-.\s]?\d{4}|02[-.\s]?\d{3}[-.\s]?\d{4})/);
    const phone = phoneMatch ? phoneMatch[0] : '-';

    // Extract Time Window
    const { timeStart, timeEnd, timeExplicit } = extractThaiTimeWindow(cleanLine);

    // Extract Weight (kg or estimated from Thai units)
    const { weightKg, weightEstimated, weightNote } = extractThaiWeight(cleanLine);

    // Geocode against Bangkok Gazetteer
    const geo = matchBangkokLocation(cleanLine);

    // Extract Customer / Shop name (text before the matched area or weight)
    const customerName = extractCustomerName(cleanLine, idx);

    // Extract item description snippet
    const itemsSummary = extractItemsSummary(cleanLine);

    // Compute realistic Confidence Score for Human-in-the-Loop review
    let confidence = geo.locationConfidence;
    const reasons = [];

    if (!geo.matched) {
      reasons.push('ไม่พบชื่อย่านในฐานข้อมูล กทม. (กรุณายืนยันพิกัด)');
    }
    if (weightEstimated) {
      confidence = Math.min(confidence, 74);
      reasons.push(weightNote || 'น้ำหนักถูกประมาณการจากข้อความ กรุณายืนยัน');
    }
    if (!timeExplicit) {
      confidence = Math.min(confidence, 86);
    }
    if (isImageFallback && idx === lines.length - 1) {
      confidence = Math.min(confidence, 76);
    }

    // Ensure any masked tokens are restored locally
    const finalName = unmaskString(customerName, vault);

    return {
      id: `ord-${idx + 1}`,
      customerName: finalName,
      addressText: geo.label,
      matchedArea: geo.label,
      itemsSummary,
      weightKg,
      timeStart,
      timeEnd,
      phone,
      lat: geo.lat,
      lng: geo.lng,
      confidence: Math.max(55, Math.min(98, Math.round(confidence))),
      reviewReason: reasons.join(' · '),
      verified: confidence >= 85 && geo.matched,
    };
  });
}

function extractThaiWeight(text) {
  const vagueFlag = /(ประมาณ|~|ราว|เหมือนเดิม|เช็กน้ำหนัก|ชุดใหญ่)/.test(text);

  // Explicit kg: "180 กก.", "250 โล", "180 kg"
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:กก\.?|กิโลกรัม|กิโล|โล|kg\.?)/i);
  if (kgMatch) {
    const val = clampWeight(parseFloat(kgMatch[1]));
    return {
      weightKg: val,
      weightEstimated: vagueFlag,
      weightNote: vagueFlag ? 'ข้อความระบุน้ำหนักโดยประมาณ (~) แนะนำให้แอดมินยืนยัน' : '',
    };
  }

  // Pack / Crate / Box unit estimation
  const packMatch = text.match(/(\d+)\s*(แพ็ก|แพ็ค|ลัง|กล่อง|ถัง|กระสอบ)/);
  if (packMatch) {
    const qty = parseInt(packMatch[1], 10);
    const unit = packMatch[2];
    const unitKg =
      unit === 'ถัง' ? 18 : unit === 'กระสอบ' ? 25 : unit === 'ลัง' ? 15 : unit === 'กล่อง' ? 12 : 12;
    return {
      weightKg: clampWeight(qty * unitKg),
      weightEstimated: true,
      weightNote: `แปลงจาก ${qty} ${unit} (~${unitKg} กก./หน่วย) กรุณาตรวจสอบน้ำหนักจริง`,
    };
  }

  return {
    weightKg: 150,
    weightEstimated: true,
    weightNote: 'ไม่ระบุน้ำหนักในข้อความ ระบบประมาณเบื้องต้น 150 กก.',
  };
}

function extractThaiTimeWindow(text) {
  // Pattern: 08:30-11:30 or 8.30 - 12.00
  const rangeMatch = text.match(/(\d{1,2})[:.](\d{2})\s*(?:[-–]|ถึง)+\s*(\d{1,2})[:.](\d{2})/);
  if (rangeMatch) {
    return {
      timeStart: `${rangeMatch[1].padStart(2, '0')}:${rangeMatch[2]}`,
      timeEnd: `${rangeMatch[3].padStart(2, '0')}:${rangeMatch[4]}`,
      timeExplicit: true,
    };
  }

  // Pattern: ก่อน 11:30 or ก่อน 10 โมง
  const beforeClock = text.match(/ก่อน\s*(\d{1,2})[:.](\d{2})/);
  if (beforeClock) {
    return {
      timeStart: '08:00',
      timeEnd: `${beforeClock[1].padStart(2, '0')}:${beforeClock[2]}`,
      timeExplicit: true,
    };
  }
  const beforeHour = text.match(/ก่อน\s*(\d{1,2})\s*โมง/);
  if (beforeHour) {
    return {
      timeStart: '08:00',
      timeEnd: `${beforeHour[1].padStart(2, '0')}:00`,
      timeExplicit: true,
    };
  }

  if (text.includes('ก่อนเที่ยง')) {
    return { timeStart: '08:00', timeEnd: '12:00', timeExplicit: true };
  }
  if (text.includes('ด่วน') || text.includes('ส่งเช้า')) {
    return { timeStart: '08:00', timeEnd: '11:00', timeExplicit: true };
  }
  if (text.includes('ช่วงบ่าย') || text.includes('บ่าย')) {
    return { timeStart: '12:00', timeEnd: '16:00', timeExplicit: true };
  }

  return { timeStart: '08:30', timeEnd: '15:30', timeExplicit: false };
}

function extractCustomerName(line, idx) {
  // Take meaningful prefix up to location/item separator
  const cleaned = line
    .replace(/โทร\s*[\d-]+/g, '')
    .replace(/ติดต่อ\S*/g, '')
    .trim();

  const segments = cleaned.split(/\s+/);
  const nameTokens = [];
  for (const seg of segments) {
    if (
      /^(ซอย|ถ\.|ถนน|สั่ง|ส่ง|ก่อน|ด่วน|ช่วง|ประมาณ|น้ำหนัก|\d+)$/.test(seg) ||
      /^\d+[:.-]/.test(seg)
    ) {
      break;
    }
    nameTokens.push(seg);
    if (nameTokens.length >= 3) break;
  }

  const candidate = nameTokens.join(' ').replace(/[|,–-]+$/, '').trim();
  return candidate.length >= 2 ? candidate : `จุดส่งสินค้า #${idx + 1}`;
}

function extractItemsSummary(line) {
  const itemKeywords = [
    'น้ำดื่ม',
    'น้ำแพ็ก',
    'โซดา+น้ำแร่',
    'น้ำแร่',
    'เครื่องดื่มชูกำลัง',
    'น้ำถัง',
    'น้ำแข็ง+น้ำแพ็ก',
    'น้ำยกลัง',
    'น้ำอัดลม',
    'ชุดใหญ่',
    'ผักสด+เนื้อไก่',
    'วัตถุดิบครัวเช้า',
    'หมูสด+ผัก',
    'อาหารทะเลแช่เย็น',
    'เนื้อสัตว์',
    'แซลมอน+ผักสลัด',
    'ผักสลัด',
    'เนยสด+นม',
    'ชุดหมูสไลซ์',
    'ของสดรวม',
    'กล่องลูกฟูก',
    'กล่องพัสดุ',
    'ลังแพ็กส่งออก',
    'กล่องฝาชน',
    'กล่องโฟม+ลัง',
    'ถุง+กล่อง',
    'ม้วนกระดาษ',
    'พาเลทกล่อง',
  ];

  for (const kw of itemKeywords) {
    if (line.includes(kw)) return kw;
  }
  return 'สินค้าจัดส่ง SME';
}

function findPhoneForLine(rawText, idx) {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const target = lines[idx] || '';
  const m = target.match(/(?:0[689]\d[-.\s]?\d{3}[-.\s]?\d{4}|02[-.\s]?\d{3}[-.\s]?\d{4})/);
  return m ? m[0] : '-';
}

function clampWeight(val) {
  const num = Number(val);
  if (!Number.isFinite(num) || num <= 0) return 150;
  return Math.round(Math.min(5000, Math.max(5, num)));
}

function sanitizeTime(t, fallback) {
  if (typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t.trim())) {
    const [h, m] = t.trim().split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return fallback;
}

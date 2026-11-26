/**
 * Bangkok & Vicinity Location Gazetteer (Thai + English keywords)
 * Used for deterministic Offline Smart Geocoding & Gemini coordinate sanity validation.
 */

export const BANGKOK_LOCATIONS = [
  // Inner Sukhumvit & Asok (SWU Prasanmit zone)
  { keywords: ['อโศก', 'ประสานมิตร', 'มศว', 'สุขุมวิท 23', 'สุขุมวิท23', 'asok', 'prasanmit', 'swu'], label: 'อโศก–ประสานมิตร (สุขุมวิท 23)', lat: 13.7392, lng: 100.5628 },
  { keywords: ['นานา', 'สุขุมวิท 11', 'เพลินจิต', 'nana', 'ploenchit'], label: 'เพลินจิต–นานา', lat: 13.7429, lng: 100.5515 },
  { keywords: ['พร้อมพงษ์', 'สุขุมวิท 39', 'สุขุมวิท 24', 'phrom phong'], label: 'พร้อมพงษ์ (สุขุมวิท 39)', lat: 13.7312, lng: 100.5698 },
  { keywords: ['ทองหล่อ', 'สุขุมวิท 55', 'thonglor'], label: 'ทองหล่อ ซอย 10', lat: 13.7336, lng: 100.5831 },
  { keywords: ['เอกมัย', 'สุขุมวิท 63', 'ekkamai'], label: 'เอกมัย 12', lat: 13.7318, lng: 100.5892 },
  { keywords: ['พระโขนง', 'phrakanong', 'phra khanong'], label: 'พระโขนง', lat: 13.7152, lng: 100.5919 },
  { keywords: ['อ่อนนุช', 'สุขุมวิท 77', 'on nut', 'onnut'], label: 'อ่อนนุช ซอย 17', lat: 13.7115, lng: 100.6054 },
  { keywords: ['อุดมสุข', 'สุขุมวิท 103', 'udom suk'], label: 'อุดมสุข (สุขุมวิท 103)', lat: 13.6801, lng: 100.6192 },
  { keywords: ['บางนา', 'เมกาบางนา', 'bangna', 'bang na'], label: 'บางนา กม.5', lat: 13.6669, lng: 100.6318 },
  { keywords: ['แบริ่ง', 'ลาซาล', 'สุขุมวิท 107', 'bearing', 'lasalle'], label: 'แบริ่ง–ลาซาล', lat: 13.6584, lng: 100.6145 },

  // Rama 4 / Silom / Sathorn / Samyan / Siam
  { keywords: ['คลองเตย', 'พระราม 4', 'พระราม4', 'klong toei', 'rama 4'], label: 'คลองเตย ถ.พระราม 4', lat: 13.7224, lng: 100.5582 },
  { keywords: ['สีลม', 'ศาลาแดง', 'silom'], label: 'สีลม คอมเพล็กซ์', lat: 13.7285, lng: 100.5350 },
  { keywords: ['สาทร', 'ช่องนนทรี', 'sathorn'], label: 'สาทร–ช่องนนทรี', lat: 13.7221, lng: 100.5293 },
  { keywords: ['สามย่าน', 'จุฬา', 'บรรทัดทอง', 'samyan', 'chula'], label: 'สามย่าน มิตรทาวน์', lat: 13.7338, lng: 100.5285 },
  { keywords: ['สยาม', 'ปทุมวัน', 'ราชประสงค์', 'siam'], label: 'สยาม–ปทุมวัน', lat: 13.7466, lng: 100.5347 },
  { keywords: ['ประตูน้ำ', 'เพชรบุรี', 'pratunam', 'phetchaburi'], label: 'ประตูน้ำ ถ.เพชรบุรี', lat: 13.7512, lng: 100.5405 },
  { keywords: ['พญาไท', 'ราชเทวี', 'phaya thai'], label: 'พญาไท', lat: 13.7570, lng: 100.5338 },
  { keywords: ['อนุสาวรีย์', 'วิคตอรี', 'victory monument'], label: 'อนุสาวรีย์ชัยสมรภูมิ', lat: 13.7649, lng: 100.5383 },
  { keywords: ['พระราม 3', 'พระราม3', 'ยานนาวา', 'rama 3'], label: 'พระราม 3 (ยานนาวา)', lat: 13.6948, lng: 100.5341 },

  // Ari / Ratchada / Huai Khwang / Rama 9 / Lat Phrao
  { keywords: ['อารีย์', 'สะพานควาย', 'พหลโยธิน', 'ari', 'saphan khwai'], label: 'ซอยอารีย์ 1', lat: 13.7796, lng: 100.5446 },
  { keywords: ['จตุจักร', 'หมอชิต', 'chatuchak', 'mo chit'], label: 'จตุจักร', lat: 13.8025, lng: 100.5538 },
  { keywords: ['บางซื่อ', 'เตาปูน', 'bang sue'], label: 'บางซื่อ', lat: 13.8036, lng: 100.5396 },
  { keywords: ['พระราม 9', 'พระราม9', 'อาร์ซีเอ', 'rama 9', 'rca'], label: 'พระราม 9', lat: 13.7578, lng: 100.5661 },
  { keywords: ['รัชดา', 'ห้วยขวาง', 'สุทธิสาร', 'ratchada', 'huai khwang'], label: 'รัชดาซอย 7 (ห้วยขวาง)', lat: 13.7671, lng: 100.5735 },
  { keywords: ['ดินแดง', 'วิภาวดี', 'din daeng'], label: 'ดินแดง–วิภาวดี', lat: 13.7695, lng: 100.5572 },
  { keywords: ['ลาดพร้าว 71', 'ลาดพร้าว71', 'นาคนิวาส', 'โชคชัย 4', 'ลาดพร้าว', 'lat phrao'], label: 'ลาดพร้าว 71 (นาคนิวาส)', lat: 13.7975, lng: 100.6088 },
  { keywords: ['วังทองหลาง', 'ทาวน์อินทาวน์', 'เลียบด่วน', 'รามอินทรา', 'ramindra'], label: 'เลียบด่วน–รามอินทรา', lat: 13.8282, lng: 100.6295 },
  { keywords: ['เกษตร', 'บางเขน', 'เสนานิคม', 'kaset', 'bang khen'], label: 'บางเขน–แยกเกษตร', lat: 13.8456, lng: 100.5774 },
  { keywords: ['รามคำแหง', 'บางกะปิ', 'หัวหมาก', 'ramkhamhaeng', 'bang kapi'], label: 'รามคำแหง–บางกะปิ', lat: 13.7662, lng: 100.6425 },
  { keywords: ['พัฒนาการ', 'ศรีนครินทร์', 'ซีคอน', 'srinakarin', 'pattanakarn'], label: 'ศรีนครินทร์–พัฒนาการ', lat: 13.7024, lng: 100.6468 },

  // North / Don Mueang / Nonthaburi
  { keywords: ['ดอนเมือง', 'สรงประภา', 'don mueang'], label: 'ดอนเมือง', lat: 13.9133, lng: 100.5980 },
  { keywords: ['แจ้งวัฒนะ', 'หลักสี่', 'chaeng watthana', 'lak si'], label: 'แจ้งวัฒนะ–หลักสี่', lat: 13.8902, lng: 100.5612 },
  { keywords: ['งามวงศ์วาน', 'รัตนาธิเบศร์', 'ngamwongwan'], fallbackKeywords: ['นนทบุรี', 'nonthaburi'], label: 'งามวงศ์วาน (นนทบุรี)', lat: 13.8558, lng: 100.5416 },
  { keywords: ['รังสิต', 'คลองหลวง', 'ตลาดไท', 'rangsit'], label: 'รังสิต–ปทุมธานี', lat: 13.9885, lng: 100.6184 },

  // East / Samut Prakan / Lat Krabang
  { keywords: ['สำโรง', 'ปู่เจ้า', 'samrong'], label: 'สำโรง (สมุทรปราการ)', lat: 13.6495, lng: 100.5960 },
  { keywords: ['เทพารักษ์', 'thepharak'], label: 'ถนนเทพารักษ์ กม.4', lat: 13.6318, lng: 100.6284 },
  { keywords: ['ปากน้ำ', 'paknam'], fallbackKeywords: ['สมุทรปราการ', 'samut prakan'], label: 'ปากน้ำ สมุทรปราการ', lat: 13.5991, lng: 100.5998 },
  { keywords: ['กิ่งแก้ว', 'บางพลี', 'สุวรรณภูมิ', 'king kaew', 'bang phli'], label: 'กิ่งแก้ว–บางพลี', lat: 13.6795, lng: 100.7152 },
  { keywords: ['ลาดกระบัง', 'lat krabang'], label: 'ลาดกระบัง', lat: 13.7278, lng: 100.7486 },
  { keywords: ['มีนบุรี', 'ร่มเกล้า', 'min buri'], label: 'มีนบุรี–ร่มเกล้า', lat: 13.8136, lng: 100.7354 },

  // Thonburi / West Bangkok
  { keywords: ['ปิ่นเกล้า', 'บางพลัด', 'จรัญ', 'pinklao'], label: 'ปิ่นเกล้า–บางพลัด', lat: 13.7764, lng: 100.4832 },
  { keywords: ['บางแค', 'เพชรเกษม', 'ท่าพระ', 'bang khae', 'phetkasem'], label: 'บางแค ถ.เพชรเกษม', lat: 13.7131, lng: 100.4352 },
  { keywords: ['วงเวียนใหญ่', 'คลองสาน', 'เจริญนคร', 'ไอคอนสยาม', 'khlong san'], label: 'คลองสาน–เจริญนคร', lat: 13.7265, lng: 100.5086 },
  { keywords: ['พระราม 2', 'พระราม2', 'บางขุนเทียน', 'rama 2'], label: 'พระราม 2', lat: 13.6695, lng: 100.4512 },
  { keywords: ['เยาวราช', 'สำเพ็ง', 'หัวลำโพง', 'yaowarat'], label: 'เยาวราช–สำเพ็ง', lat: 13.7413, lng: 100.5082 },
];

const ASCII_KW_RE = /^[a-z0-9 ]+$/;

function matchesKeyword(normalizedText, rawKeyword) {
  const kw = rawKeyword.toLowerCase();
  if (!ASCII_KW_RE.test(kw)) {
    return normalizedText.includes(kw);
  }
  let idx = normalizedText.indexOf(kw);
  while (idx !== -1) {
    const before = idx > 0 ? normalizedText[idx - 1] : ' ';
    const after = idx + kw.length < normalizedText.length ? normalizedText[idx + kw.length] : ' ';
    const beforeOk = !/[a-z0-9]/.test(before);
    const afterOk = !/[a-z0-9]/.test(after);
    if (beforeOk && afterOk) return true;
    idx = normalizedText.indexOf(kw, idx + 1);
  }
  return false;
}

/**
 * Matches a Thai or English address string against the Bangkok Gazetteer.
 * Specific district/road keywords always outrank broad province fallbackKeywords.
 * Never reflects raw untrusted input in `label` when unmatched (prevents XSS & PII leaks).
 */
export function matchBangkokLocation(text = '') {
  const safeInput = typeof text === 'string' ? text.slice(0, 500) : '';
  const normalized = safeInput.toLowerCase().replace(/\s+/g, ' ').trim();
  let bestMatch = null;
  let bestScore = 0;

  for (const loc of BANGKOK_LOCATIONS) {
    for (const kw of loc.keywords) {
      if (matchesKeyword(normalized, kw)) {
        const score = 100 + kw.length;
        if (score > bestScore) {
          bestMatch = loc;
          bestScore = score;
        }
      }
    }
    if (loc.fallbackKeywords) {
      for (const kw of loc.fallbackKeywords) {
        if (matchesKeyword(normalized, kw)) {
          const score = 10 + kw.length;
          if (score > bestScore) {
            bestMatch = loc;
            bestScore = score;
          }
        }
      }
    }
  }

  if (bestMatch) {
    return {
      matched: true,
      label: bestMatch.label,
      lat: bestMatch.lat,
      lng: bestMatch.lng,
      locationConfidence: bestScore >= 105 ? 96 : 89,
    };
  }

  // Deterministic fallback near central Bangkok if completely unknown, marked LOW confidence for Human-in-the-Loop
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 1000;
  }
  const offsetLat = ((hash % 40) - 20) * 0.0018;
  const offsetLng = (((hash >> 3) % 40) - 20) * 0.0018;

  return {
    matched: false,
    label: 'ไม่พบพิกัดชัดเจน (ต้องตรวจสอบ)',
    lat: Number((13.746 + offsetLat).toFixed(4)),
    lng: Number((100.558 + offsetLng).toFixed(4)),
    locationConfidence: 62,
  };
}

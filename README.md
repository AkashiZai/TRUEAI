# GreenRoute AI — Chat-to-Green-Route & Carbon Optimizer for Thai SMEs

**AI for Future Workforce Competition (True x Google) — Track 4: Sustainability & Environment (SWU)**  
**Live Prototype (Cloudflare Workers · A+ Security Headers):** https://greenroute-ai.trueai.workers.dev/  
**Backup Mirror (GitHub Pages):** https://akashizai.github.io/TRUEAI/

GreenRoute AI เปลี่ยนแชตสั่งของ LINE และรูปถ่ายใบส่งของของธุรกิจ SMEs ไทยให้กลายเป็นแผนจัดเส้นทางขนส่งที่วิ่งระยะทางสั้นที่สุด บรรทุกเต็มคันที่สุด และปล่อยก๊าซเรือนกระจกน้อยที่สุดภายในไม่กี่วินาที พร้อมออกรายงาน **Carbon Footprint ตามมาตรฐาน อบก. (TGO)** อัตโนมัติ

## สถาปัตยกรรมระบบบน Google Ecosystem (Hybrid AI + Deterministic CS)

1. **Layer 1 — Multimodal Order Extraction & PDPA Privacy (`src/engine/orderExtractor.js`, `src/engine/piiMasker.js`, `src/engine/imageRedactor.js`)**
   - **On-Device & Serverless GPU PDPA (Production):** รองรับ **Google Gemma 3n** (Google AI Edge / MediaPipe) รันบนอุปกรณ์โดยตรง และ **Google Gemma 3 (4B/12B Vision)** บน **Google Cloud Run Serverless GPU** (Private VPC · Scale-to-Zero) ข้อมูลและรูปบิลไม่หลุดออกภายนอก
   - **Cloud API + Fail-Closed Visual & Text Redaction (Live Prototype):**
     - **Text PII Masking:** ใช้ Per-Line Cryptographic Nonce Vault ป้องกันการปลอม Token ข้ามลูกค้า ครอบคลุมเบอร์โทร (+66 / 02–09 / เลขไทย ๐–๙), บัตรประชาชน 13 หลัก, เลขบัญชี, LINE ID, อีเมล และชื่อ–นามสกุลบุคคล
     - **Visual Image Redaction:** ตรวจ Magic Bytes ไฟล์ภาพ (รองรับเฉพาะ PNG/JPEG/WebP ไม่รับ SVG), ลบ EXIF/GPS 100% ผ่าน Canvas พร้อมจำกัดความละเอียดสูงสุด 2048px และทำงานแบบ **Fail-Closed** (บล็อกการส่งภาพทันทีหาก Redaction ไม่เสร็จสมบูรณ์)
     - **Prompt Security:** แยก `systemInstruction` + บังคับ `responseSchema` ของ **Google Gemini 2.5 Flash API** และส่ง Key ผ่าน `x-goog-api-key` Header (ไม่ใส่ใน URL Query String)
   - **Auto-Failover & Strict Offline Mode:** มี **Offline Smart Fallback** ภาษาไทยในตัว และเมื่อเปิดโหมด **Safe Demo Mode (`forceOffline`)** ระบบปิดการส่งข้อมูลออกทั้ง Gemini API และ OSRM Routing ภายนอก 100%
2. **Layer 2 — Google OR-Tools CVRPTW & Maps Optimization (`src/engine/cvrptwSolver.js`)**
   - ไม่ให้ LLM คิดเลข/จัดสายเอง (ป้องกัน Hallucination 100%)
   - ใช้แนวคิด **Google OR-Tools (CVRPTW)** (*Clarke-Wright Savings $O(N^2)$ + Time-Window Affinity + Bin-Packing Consolidation + Bounded 2-Opt + 1-0 Relocate*) ลดระยะทางและยุบเที่ยวรถเปล่า พร้อมต่อยอด **Google Maps Platform (Routes API / Route Optimization API)**
   - แสดงผลแผนที่ด้วย Leaflet DOM `.textContent` ล้วน (**Zero `innerHTML` / ป้องกัน DOM XSS**) และสร้าง **ลำดับยกสินค้าขึ้นรถแบบ LIFO** + ลิงก์นำทาง **Google Maps** หลายจุดส่งเข้า LINE คนขับ
3. **Layer 3 — Google Cloud & Deterministic TGO Carbon Engine (`src/engine/tgoCarbonEngine.js`)**
   - อ้างอิงค่า Emission Factor น้ำมันดีเซลของ **องค์การบริหารจัดการก๊าซเรือนกระจก (อบก. / TGO)**:
     - Scope 1 (Mobile Combustion): `2.7403 kgCO2e / ลิตร`
     - Well-to-Wheel / Scope 3 (สำหรับรายงานคู่ค้า B2B): `3.0326 kgCO2e / ลิตร`
   - ไฟล์ **B2B ESG JSON** ตัดข้อมูลส่วนบุคคลของลูกค้าออกอัตโนมัติ (PDPA-Anonymized Export) และรองรับการพิมพ์รายงาน **A4 PDF**

## มาตรฐานความปลอดภัย (Security Hardening)

- **Strict CSP & Referrer Policy (`index.html`):** บังคับ `script-src 'self'`, `object-src 'none'`, `referrer: no-referrer` และบันเดิล Leaflet CSS ไว้ในโปรเจกต์โดยไม่พึ่งพา CDN `unpkg.com`
- **No Static Bundled Keys:** เก็บ Gemini API Key ชั่วคราวเฉพาะใน `sessionStorage` ของแท็บปัจจุบัน (ล้างอัตโนมัติเมื่อปิดแท็บ) และห้ามใส่ API Key ใน `.env` ฝั่ง Frontend เพื่อป้องกัน Secret หลุดเข้า static bundle
- **CI/CD Supply-Chain Security (`.github/workflows/deploy.yml`):** Pin GitHub Actions ด้วย Commit SHA ครบทุกตัว, แยก `permissions` น้อยที่สุดราย Job, ใช้ `persist-credentials: false`, `npm ci --ignore-scripts`, และบังคับรัน `npm run lint` + `npm run test:security` ก่อน Deploy ทุกครั้ง

## วิธีรันใช้งานและทดสอบความปลอดภัยบนเครื่อง (Local Setup)

```bash
npm ci --ignore-scripts
npm run lint
npm run test:security
npm run dev
```

### การตั้งค่า Google Gemini API Key (ไม่บังคับ)
- กดปุ่ม **API Key** มุมขวาบนในหน้าเว็บเพื่อวาง Gemini API Key จาก Google AI Studio (เก็บชั่วคราวเฉพาะใน `sessionStorage` ของแท็บปัจจุบัน และส่งผ่าน Header `x-goog-api-key`)
- หากไม่ได้ใส่ Key หรือเปิด **Safe Demo Mode** ระบบจะใช้ **Offline Smart Fallback** ทำงานฝั่งเครื่องได้ครบทุกฟีเจอร์ทันที

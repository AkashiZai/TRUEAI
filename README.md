# GreenRoute AI — Chat-to-Green-Route & Carbon Optimizer for Thai SMEs

**AI for Future Workforce Competition (True x Google) — Track 4: Sustainability & Environment (SWU)**

GreenRoute AI เปลี่ยนแชตสั่งของ LINE และรูปถ่ายใบส่งของของธุรกิจ SMEs ไทยให้กลายเป็นแผนจัดเส้นทางขนส่งที่วิ่งระยะทางสั้นที่สุด บรรทุกเต็มคันที่สุด และปล่อยก๊าซเรือนกระจกน้อยที่สุดภายในไม่กี่วินาที พร้อมออกรายงาน **Carbon Footprint ตามมาตรฐาน อบก. (TGO)** อัตโนมัติ

## สถาปัตยกรรมระบบ (Hybrid AI + Deterministic CS)

1. **Layer 1 — Multimodal Order Extraction & PDPA Guardrail (`src/engine/orderExtractor.js`, `src/engine/piiMasker.js`)**
   - ทำ **PII Masking** (ซ่อนเบอร์โทร/ชื่อบุคคล) ก่อนส่งข้อความเข้า **Google Gemini 2.5 Flash API** (รองรับทั้งแชตข้อความภาษาไทยและรูปใบส่งของ OCR)
   - มี **Offline Smart Fallback** ภาษาไทยในตัว — หากไม่ได้ใส่ API Key, เน็ตหลุด, หรือติด Rate Limit (`HTTP 429`) ระบบจะสลับมาแกะออเดอร์แบบ Offline อัตโนมัติทันทีโดยไม่สะดุดระหว่างพรีเซนต์
   - มี **Human-in-the-Loop Confidence Flag** ไฮไลต์รายการที่น้ำหนัก/พิกัดไม่ชัดเจนให้แอดมินตรวจสอบก่อนปล่อยรถ
2. **Layer 2 — CVRPTW & Load Optimization Solver (`src/engine/cvrptwSolver.js`)**
   - ไม่ให้ LLM คิดเลข/จัดสายเอง (ป้องกัน Hallucination 100%)
   - ใช้ **Clarke-Wright Savings + Time-Window Affinity + Bin-Packing Consolidation + 2-Opt + 1-0 Inter-Route Relocate** เพื่อลดระยะทางและลดจำนวนเที่ยวรถเปล่า
   - สร้าง **ลำดับยกสินค้าขึ้นรถแบบ LIFO** (จุดที่ส่งลำดับแรกวางท้ายรถ) และดึงเส้นทางถนนจริงในกรุงเทพฯ ผ่าน OSRM (พร้อมโหมด Offline fallback)
3. **Layer 3 — Deterministic TGO Carbon & ROI Engine (`src/engine/tgoCarbonEngine.js`)**
   - อ้างอิงค่า Emission Factor น้ำมันดีเซลของ **องค์การบริหารจัดการก๊าซเรือนกระจก (อบก. / TGO)**:
     - Scope 1 (Mobile Combustion): `2.7403 kgCO2e / ลิตร`
     - Well-to-Wheel / Scope 3 (สำหรับรายงานคู่ค้า B2B): `3.0326 kgCO2e / ลิตร`
   - รองรับการพิมพ์/บันทึก **รายงาน ESG A4 PDF** และดาวน์โหลด **ESG JSON**

## วิธีรันใช้งานบนเครื่อง (Local Setup)

```bash
npm install
npm run dev
```

### การตั้งค่า Google Gemini API Key (ไม่บังคับ)
- สามารถกดปุ่ม **API Key** มุมขวาบนในหน้าเว็บเพื่อวาง Gemini API Key จาก Google AI Studio (เก็บไว้เฉพาะใน `localStorage` ของเบราว์เซอร์)
- หรือสร้างไฟล์ `.env` แล้วระบุ:
  ```env
  VITE_GEMINI_API_KEY=your_api_key_here
  ```
- หากไม่ได้ใส่ Key หรือเปิด **Safe Demo Mode** ระบบจะใช้ **Offline Smart Fallback** ทำงานได้ครบทุกฟีเจอร์ทันที

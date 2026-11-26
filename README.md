# GreenRoute AI — Chat-to-Green-Route & Carbon Optimizer for Thai SMEs

**AI for Future Workforce Competition (True x Google) — Track 4: Sustainability & Environment (SWU)**  
**Live Prototype:** https://akashizai.github.io/TRUEAI/

GreenRoute AI เปลี่ยนแชตสั่งของ LINE และรูปถ่ายใบส่งของของธุรกิจ SMEs ไทยให้กลายเป็นแผนจัดเส้นทางขนส่งที่วิ่งระยะทางสั้นที่สุด บรรทุกเต็มคันที่สุด และปล่อยก๊าซเรือนกระจกน้อยที่สุดภายในไม่กี่วินาที พร้อมออกรายงาน **Carbon Footprint ตามมาตรฐาน อบก. (TGO)** อัตโนมัติ

## สถาปัตยกรรมระบบบน Google Ecosystem (Hybrid AI + Deterministic CS)

1. **Layer 1 — Multimodal Order Extraction & PDPA Privacy (`src/engine/orderExtractor.js`, `src/engine/piiMasker.js`, `src/engine/imageRedactor.js`)**
   - **On-Device & Serverless GPU PDPA (Production):** รองรับ **Google Gemma 3n** (Google AI Edge / MediaPipe) รันบนอุปกรณ์โดยตรง และ **Google Gemma 3 (4B/12B Vision)** บน **Google Cloud Run Serverless GPU** (Private VPC · Scale-to-Zero) ข้อมูลและรูปบิลไม่หลุดออกภายนอก
   - **Cloud API + Client-Side Visual Redaction (Live Prototype):** ทำ **Text PII Masking** (`[PHONE_01]`) และ **Client-Side Canvas Visual Redaction** คาดแถบดำลบคอลัมน์เบอร์โทรบนภาพในเครื่องก่อนส่ง **Google Gemini 2.5 Flash API**
   - **Auto-Failover:** มี **Offline Smart Fallback** ภาษาไทยในตัว หากไม่ได้ใส่ API Key, เน็ตหลุด, หรือติด Rate Limit (`HTTP 429`) ระบบสลับออฟไลน์อัตโนมัติทันที
   - **Human-in-the-Loop:** ไฮไลต์รายการที่ AI มั่นใจต่ำกว่า 85% ให้แอดมินตรวจแก้ก่อนจัดสาย
2. **Layer 2 — Google OR-Tools CVRPTW & Maps Optimization (`src/engine/cvrptwSolver.js`)**
   - ไม่ให้ LLM คิดเลข/จัดสายเอง (ป้องกัน Hallucination 100%)
   - ใช้แนวคิด **Google OR-Tools (CVRPTW)** (*Clarke-Wright Savings + Time-Window Affinity + Bin-Packing Consolidation + 2-Opt + 1-0 Relocate*) ลดระยะทางและยุบเที่ยวรถเปล่า พร้อมต่อยอด **Google Maps Platform (Routes API / Route Optimization API)**
   - สร้าง **ลำดับยกสินค้าขึ้นรถแบบ LIFO** และลิงก์นำทาง **Google Maps** หลายจุดส่งเข้า LINE คนขับทันที
3. **Layer 3 — Google Cloud & Deterministic TGO Carbon Engine (`src/engine/tgoCarbonEngine.js`)**
   - อ้างอิงค่า Emission Factor น้ำมันดีเซลของ **องค์การบริหารจัดการก๊าซเรือนกระจก (อบก. / TGO)**:
     - Scope 1 (Mobile Combustion): `2.7403 kgCO2e / ลิตร`
     - Well-to-Wheel / Scope 3 (สำหรับรายงานคู่ค้า B2B): `3.0326 kgCO2e / ลิตร`
   - ต่อยอดจัดเก็บ Geocoding Cache ลูกค้าประจำ (70–80%) บน **Cloud Firestore** และรองรับการพิมพ์ **รายงาน ESG A4 PDF** / ดาวน์โหลด **ESG JSON**

## วิธีรันใช้งานบนเครื่อง (Local Setup)

```bash
npm install
npm run dev
```

### การตั้งค่า Google Gemini API Key (ไม่บังคับ)
- กดปุ่ม **API Key** มุมขวาบนในหน้าเว็บเพื่อวาง Gemini API Key จาก Google AI Studio (เก็บไว้เฉพาะใน `localStorage` ของเบราว์เซอร์)
- หรือสร้างไฟล์ `.env` แล้วระบุ `VITE_GEMINI_API_KEY=your_api_key_here`
- หากไม่ได้ใส่ Key หรือเปิด **Safe Demo Mode** ระบบจะใช้ **Offline Smart Fallback** ทำงานได้ครบทุกฟีเจอร์ทันที

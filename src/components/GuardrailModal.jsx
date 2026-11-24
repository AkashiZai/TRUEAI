import { Cpu, Lock, ShieldCheck, X } from 'lucide-react';

export default function GuardrailModal({ isOpen, onClose, piiReport, telemetry, optimization }) {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color="var(--pine-800)" />
            <div>
              <h2>PDPA PII Masking &amp; Hybrid AI Architecture Inspector</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                หน้าสำหรับตอบคำถาม Q&amp;A กรรมการเรื่องความปลอดภัยข้อมูลและข้อจำกัดของ AI
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Hybrid Architecture Summary */}
          <div className="report-summary-grid">
            <div className="report-stat">
              <div className="report-stat-label">
                <Lock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                PDPA Redaction
              </div>
              <div className="report-stat-val mono">{piiReport?.maskedCount || 0} รายการ</div>
              <div className="report-stat-sub">ซ่อนเบอร์โทร/ชื่อบุคคลก่อนส่ง API</div>
            </div>

            <div className="report-stat">
              <div className="report-stat-label">
                <Cpu size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                CVRPTW Solver
              </div>
              <div className="report-stat-val mono">
                {optimization?.benchmark?.solveTimeMs || 0} ms
              </div>
              <div className="report-stat-sub mono">
                {optimization?.benchmark?.iterations || 0} evaluations (0% Hallucination)
              </div>
            </div>

            <div className="report-stat">
              <div className="report-stat-label">Extraction Resilience</div>
              <div className="report-stat-val" style={{ fontSize: 14, marginTop: 8 }}>
                {telemetry?.mode === 'gemini-live' ? 'Gemini Live API' : 'Offline Smart Fallback'}
              </div>
              <div className="report-stat-sub">Auto-failover เมื่อติด 429 Limit</div>
            </div>
          </div>

          {/* Live PDPA Masking Diff */}
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13.5 }}>
              ตัวอย่างข้อมูลก่อน-หลังทำ PDPA PII Masking (ข้อมูลจริงในรอบนี้)
            </h3>
            <div className="diff-grid">
              <div>
                <div className="field-label" style={{ marginBottom: 5 }}>
                  <span>ข้อมูลดิบบนเครื่องลูกค้า (Local Only)</span>
                </div>
                <div className="code-block" style={{ maxHeight: 200 }}>
                  {piiReport?.rawText || 'ยังไม่มีข้อมูล'}
                </div>
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 5 }}>
                  <span>Payload ที่ส่งเข้า Gemini Cloud API (Redacted)</span>
                </div>
                <div className="code-block" style={{ maxHeight: 200, background: '#0e281d' }}>
                  {piiReport?.maskedText || 'ยังไม่มีข้อมูล'}
                </div>
              </div>
            </div>
          </div>

          {/* CS Design Justification */}
          <div className="notice info" style={{ marginTop: 0 }}>
            <div>
              <strong>ทำไมต้องแยก 3 Layer (Hybrid AI + Deterministic CS)?</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>
                  <strong>Layer 1 (Gemini Multimodal):</strong> ใช้เฉพาะงานที่ LLM เก่งที่สุด คือแกะแชตภาษาไทยที่ไร้โครงสร้างและอ่านภาพถ่ายใบส่งของ พร้อมให้คะแนนความมั่นใจ (Human-in-the-Loop)
                </li>
                <li>
                  <strong>Layer 2 (CVRPTW Algorithm):</strong> ไม่ให้ LLM จัดเส้นทางเองเพื่อกัน Hallucination แต่ใช้ <em>Clarke-Wright Savings + 2-Opt + Inter-Route Relocate</em> ภายใต้ข้อจำกัดน้ำหนักรถและเวลาเปิด-ปิดร้าน
                </li>
                <li>
                  <strong>Layer 3 (TGO Formula Engine):</strong> คำนวณ CO₂ ด้วยสูตรตรงตาม อบก. (2.7403 / 3.0326 kgCO₂e/ลิตร) ตรวจสอบย้อนหลังได้ 100%
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}

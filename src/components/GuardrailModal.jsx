import { useEffect, useState } from 'react';
import { Cpu, Image as ImageIcon, Lock, ShieldCheck, X } from 'lucide-react';
import { generateSampleThaiReceiptImage } from '../data/demoPresets';
import { applyVisualRedaction, REDACTION_PRESETS } from '../engine/imageRedactor';

export default function GuardrailModal({
  isOpen,
  onClose,
  piiReport,
  imagePrivacy,
  telemetry,
  optimization,
}) {
  const [fallbackDemoPair, setFallbackDemoPair] = useState({ raw: null, redacted: null });

  // Prepare an automatic visual redaction proof pair so Q&A always has a live Before/After image demo
  useEffect(() => {
    if (!isOpen || imagePrivacy?.raw) return;
    let cancelled = false;
    const raw = generateSampleThaiReceiptImage();
    const defaultBoxes = REDACTION_PRESETS[0].boxes;
    applyVisualRedaction(raw, defaultBoxes).then((redacted) => {
      if (!cancelled) setFallbackDemoPair({ raw, redacted });
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, imagePrivacy?.raw]);

  if (!isOpen) return null;

  const displayRawImg = imagePrivacy?.raw || fallbackDemoPair.raw;
  const displayRedactedImg = imagePrivacy?.redacted || fallbackDemoPair.redacted;

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={20} color="var(--pine-800)" />
            <div>
              <h2>PDPA Privacy Guardrails (Text + Image) &amp; Hybrid AI Inspector</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                ป้องกันข้อมูลส่วนบุคคลรั่วไหลทั้งข้อความแชตและรูปใบส่งของ ก่อนส่งเข้า Cloud API
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
                Text PII Masking
              </div>
              <div className="report-stat-val mono">{piiReport?.maskedCount || 0} รายการ</div>
              <div className="report-stat-sub">ซ่อนเบอร์โทร/ชื่อบุคคลเป็น Token</div>
            </div>

            <div className="report-stat">
              <div className="report-stat-label">
                <ImageIcon size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                Visual Image Redaction
              </div>
              <div className="report-stat-val" style={{ fontSize: 14, marginTop: 8 }}>
                Client-Side Canvas
              </div>
              <div className="report-stat-sub">คาดแถบดำปิดคอลัมน์เบอร์โทรในเครื่อง</div>
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
                {optimization?.benchmark?.iterations || 0} evals ·{' '}
                {telemetry?.mode === 'gemini-live' ? 'Gemini Live' : 'Offline Fallback'}
              </div>
            </div>
          </div>

          {/* Live Text PDPA Masking Diff */}
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13.5 }}>
              1) โหมดข้อความ (LINE Chat): เปรียบเทียบก่อน-หลังทำ Local PII Masking
            </h3>
            <div className="diff-grid">
              <div>
                <div className="field-label" style={{ marginBottom: 5 }}>
                  <span>ข้อมูลดิบบนเครื่องลูกค้า (Local Only)</span>
                </div>
                <div className="code-block" style={{ maxHeight: 155 }}>
                  {piiReport?.rawText || 'ยังไม่มีข้อมูล'}
                </div>
              </div>
              <div>
                <div className="field-label" style={{ marginBottom: 5 }}>
                  <span>Payload ที่ส่งเข้า Gemini Cloud API (Redacted)</span>
                </div>
                <div className="code-block" style={{ maxHeight: 155, background: '#0e281d' }}>
                  {piiReport?.maskedText || 'ยังไม่มีข้อมูล'}
                </div>
              </div>
            </div>
          </div>

          {/* Live Visual Image Redaction Diff */}
          {displayRawImg && displayRedactedImg && (
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 13.5 }}>
                2) โหมดรูปใบส่งของ (Image OCR): Client-Side Visual Redaction ก่อนส่ง Gemini Vision
              </h3>
              <div className="diff-grid">
                <div>
                  <div className="field-label" style={{ marginBottom: 5 }}>
                    <span>ภาพต้นฉบับในเครื่อง (มีคอลัมน์เบอร์โทร PII)</span>
                  </div>
                  <img
                    src={displayRawImg}
                    alt="ภาพใบส่งของต้นฉบับบนเครื่องลูกค้า"
                    style={{
                      width: '100%',
                      borderRadius: 8,
                      border: '1px solid var(--border-strong)',
                      display: 'block',
                    }}
                  />
                </div>
                <div>
                  <div className="field-label" style={{ marginBottom: 5 }}>
                    <span>ภาพที่ส่งออก Cloud (คาดแถบดำลบพิกเซล PII แล้ว)</span>
                  </div>
                  <img
                    src={displayRedactedImg}
                    alt="ภาพใบส่งของที่ผ่านการคาดแถบดำลบเบอร์โทรแล้ว"
                    style={{
                      width: '100%',
                      borderRadius: 8,
                      border: '1.5px solid var(--pine-700)',
                      display: 'block',
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Full Google Ecosystem PDPA & Security Architecture Defense Note */}
          <div className="notice info" style={{ marginTop: 0 }}>
            <div>
              <strong>สถาปัตยกรรม PDPA &amp; Security-by-Design บน Google Ecosystem:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>
                  <strong>1) On-Device Private AI (PDPA 100%):</strong> รัน <em>Google Gemma 3n (Google AI Edge / MediaPipe)</em> + <em>Google ML Kit</em> บนมือถือ/เครื่องลูกค้าโดยตรง ข้อมูลและรูปบิลไม่หลุดออกนอกเครื่องเลย
                </li>
                <li>
                  <strong>2) Serverless GPU Private OCR:</strong> รัน <em>Google Gemma 3 (4B/12B Vision)</em> บน <em>Google Cloud Run GPU</em> (Private VPC · Scale-to-Zero คิดเงินเฉพาะวินาทีที่ใช้งาน) รองรับบิลลายมือหวัดโดยไม่ส่งภาพไปภายนอก
                </li>
                <li>
                  <strong>3) Cloud Multimodal + Fail-Closed Redaction:</strong> ใช้ <em>Google Gemini 2.5 Flash</em> (ส่ง Key ผ่าน <code>x-goog-api-key</code> Header + เก็บเฉพาะ <code>sessionStorage</code>) คู่กับ <em>Per-Line Nonce PII Vault</em> และ <em>EXIF-Stripping Canvas Redaction</em> ที่บล็อกส่งภาพทันทีหาก Redaction ไม่สมบูรณ์
                </li>
                <li>
                  <strong>4) Zero-XSS &amp; Strict CSP Hardening:</strong> สร้างแผนที่ Leaflet ด้วย DOM <code>.textContent</code> ล้วน (Zero <code>innerHTML</code>), บังคับ <em>Content Security Policy (CSP)</em> + <em>Referrer-Policy</em>, และตัด PII ลูกค้าออกจากไฟล์ <em>B2B ESG JSON</em> อัตโนมัติ
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

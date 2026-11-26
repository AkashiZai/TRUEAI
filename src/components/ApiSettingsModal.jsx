import { useState } from 'react';
import { KeyRound, ShieldAlert, Trash2, X } from 'lucide-react';
import { ALLOWED_GEMINI_MODELS } from '../engine/securityUtils';

export default function ApiSettingsModal({
  isOpen,
  onClose,
  apiKey,
  model,
  forceOffline,
  onSave,
}) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(
    ALLOWED_GEMINI_MODELS.has(model) ? model : 'gemini-2.5-flash'
  );
  const [draftForceOffline, setDraftForceOffline] = useState(forceOffline);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const safeModel = ALLOWED_GEMINI_MODELS.has(draftModel) ? draftModel : 'gemini-2.5-flash';
    onSave({
      apiKey: draftKey.trim(),
      model: safeModel,
      forceOffline: draftForceOffline,
    });
    onClose();
  };

  const handleClearKeyNow = () => {
    setDraftKey('');
    onSave({
      apiKey: '',
      model: ALLOWED_GEMINI_MODELS.has(draftModel) ? draftModel : 'gemini-2.5-flash',
      forceOffline: draftForceOffline,
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog is-compact" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={18} color="var(--pine-800)" />
            <div>
              <h2>ตั้งค่า Google Gemini API &amp; Offline Fallback</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                เก็บ Key แบบชั่วคราวใน sessionStorage เท่านั้น (ล้างอัตโนมัติเมื่อปิดแท็บ · ส่งผ่าน Header x-goog-api-key)
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="input-field">
              <label htmlFor="gemini-api-key">Google AI Studio API Key (ไม่บังคับ · Session Only)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  id="gemini-api-key"
                  type="password"
                  className="input-control mono"
                  style={{ flex: 1 }}
                  value={draftKey}
                  onChange={(e) => setDraftKey(e.target.value)}
                  placeholder="AIzaSy... (ปล่อยว่างเพื่อใช้ Offline Smart Fallback)"
                  autoComplete="new-password"
                  spellCheck={false}
                />
                {draftKey && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleClearKeyNow}
                    title="ล้าง API Key ออกจากเซสชันทันที"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                ปลอดภัยกว่า localStorage: ไม่ค้างบนดิสก์ข้ามเซสชัน และไม่แชร์ข้ามแท็บ (Production ใช้ Backend Proxy บน Cloud Run)
              </span>
            </div>

            <div className="input-field">
              <label htmlFor="gemini-model-select">Google AI Model (Cloud API / Private Architecture)</label>
              <select
                id="gemini-model-select"
                className="input-control"
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">Google Gemini 2.5 Flash (แนะนำ — Multimodal OCR + JSON)</option>
                <option value="gemini-2.0-flash">Google Gemini 2.0 Flash</option>
              </select>
              <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                Production PDPA รองรับการรัน <strong>Google Gemma 3 Vision</strong> บน <strong>Cloud Run Serverless GPU</strong> (Scale-to-Zero) และ <strong>Gemma 3n On-Device</strong>
              </span>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '11px 12px',
                borderRadius: 9,
                border: '1px solid var(--border-hairline)',
                background: 'var(--bg-canvas)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={draftForceOffline}
                onChange={(e) => setDraftForceOffline(e.target.checked)}
                style={{ marginTop: 3 }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  เปิดโหมด On-Device / Offline Smart Fallback ตลอดเวลา (Safe Demo Mode)
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                  ปิดการส่งข้อมูลออกทั้ง Gemini API และ OSRM Routing ภายนอก 100% (ความเร็ว &lt;50ms, PDPA ปลอดภัยสูงสุด และไม่ติด Rate Limit)
                </div>
              </div>
            </label>

            <div className="notice warn" style={{ marginTop: 0 }}>
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Auto-Failover ทำงานอัตโนมัติ:</strong> แม้จะใส่ API Key ไว้ หากเกิด
                HTTP 429 (ติด Limit), หมดโควตา, หรือเน็ตหลุดระหว่างพรีเซนต์
                ระบบจะสลับมาใช้ Offline Smart Fallback ทันทีโดยไม่ค้างหรือ Error
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              ยกเลิก
            </button>
            <button id="btn-save-api-settings" type="submit" className="btn btn-primary">
              บันทึกการตั้งค่า
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

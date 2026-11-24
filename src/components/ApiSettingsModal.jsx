import { useState } from 'react';
import { KeyRound, ShieldAlert, X } from 'lucide-react';

export default function ApiSettingsModal({
  isOpen,
  onClose,
  apiKey,
  model,
  forceOffline,
  onSave,
}) {
  const [draftKey, setDraftKey] = useState(apiKey);
  const [draftModel, setDraftModel] = useState(model);
  const [draftForceOffline, setDraftForceOffline] = useState(forceOffline);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      apiKey: draftKey.trim(),
      model: draftModel,
      forceOffline: draftForceOffline,
    });
    onClose();
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
                เก็บ Key ไว้เฉพาะในเบราว์เซอร์เครื่องคุณ (localStorage) ไม่ส่งไปเซิร์ฟเวอร์อื่น
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
              <label htmlFor="gemini-api-key">Google AI Studio API Key (ไม่บังคับ)</label>
              <input
                id="gemini-api-key"
                type="password"
                className="input-control mono"
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="AIzaSy... (ปล่อยว่างเพื่อใช้ Offline Smart Fallback)"
                autoComplete="off"
              />
            </div>

            <div className="input-field">
              <label htmlFor="gemini-model-select">Gemini Model</label>
              <select
                id="gemini-model-select"
                className="input-control"
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
              >
                <option value="gemini-2.5-flash">gemini-2.5-flash (แนะนำ — เร็วและรองรับภาพ OCR)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
              </select>
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
                  เปิดโหมด Offline Smart Fallback ตลอดเวลา (Safe Demo Mode)
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                  เหมาะสำหรับซ้อมหรือช่วง Q&amp;A ที่ต้องการความเร็ว &lt;50ms โดยไม่ต้องกังวล Rate Limit ของ Gemini
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

import { useRef } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ImagePlus,
  MessageSquareText,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DEMO_PRESETS, generateSampleThaiReceiptImage } from '../data/demoPresets';

export default function OrderInputPanel({
  activePresetId,
  onSelectPreset,
  inputMode,
  onChangeInputMode,
  rawChat,
  onChangeRawChat,
  imageDataUrl,
  onChangeImage,
  fleetConfig,
  onChangeFleetConfig,
  onExtract,
  isExtracting,
  telemetry,
}) {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSampleReceipt = () => {
    const dataUrl = generateSampleThaiReceiptImage();
    onChangeImage(dataUrl);
  };

  return (
    <section className="panel" aria-label="รับออเดอร์จากแชตหรือรูปใบส่งของ">
      <div className="panel-header">
        <div className="panel-title-group">
          <span className="step-badge">1</span>
          <div>
            <h2 className="panel-title">รับออเดอร์ SMEs (LINE Chat / ใบส่งของ)</h2>
            <p className="panel-subtitle">วางข้อความแชตภาษาไทยหรืออัปโหลดรูปบิล แล้วให้ AI แกะข้อมูล</p>
          </div>
        </div>
      </div>

      <div className="panel-body">
        {/* Preset Selector */}
        <div className="preset-row">
          <div className="field-label">
            <span>เคสตัวอย่างธุรกิจ SMEs ไทย</span>
          </div>
          <div className="preset-pills">
            {DEMO_PRESETS.map((preset) => (
              <button
                key={preset.id}
                id={`preset-${preset.id}`}
                type="button"
                className={`preset-btn ${activePresetId === preset.id ? 'is-active' : ''}`}
                onClick={() => onSelectPreset(preset.id)}
              >
                <strong>{preset.title}</strong>
                <span>{preset.subtitle}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Mode Switcher */}
        <div className="field-label" style={{ marginBottom: 8 }}>
          <span>รูปแบบข้อมูลนำเข้า</span>
          <div className="segmented" role="tablist">
            <button
              id="tab-text-mode"
              type="button"
              role="tab"
              aria-selected={inputMode === 'text'}
              className={`segmented-btn ${inputMode === 'text' ? 'is-active' : ''}`}
              onClick={() => onChangeInputMode('text')}
            >
              <MessageSquareText size={13} />
              <span>แชต LINE</span>
            </button>
            <button
              id="tab-image-mode"
              type="button"
              role="tab"
              aria-selected={inputMode === 'image'}
              className={`segmented-btn ${inputMode === 'image' ? 'is-active' : ''}`}
              onClick={() => onChangeInputMode('image')}
            >
              <Camera size={13} />
              <span>รูปใบส่งของ (OCR)</span>
            </button>
          </div>
        </div>

        {inputMode === 'text' ? (
          <textarea
            id="input-line-chat"
            className="chat-textarea"
            value={rawChat}
            onChange={(e) => onChangeRawChat(e.target.value)}
            placeholder="วางข้อความออเดอร์จากแชต LINE เช่น: 1. ร้านเจ๊หมวย สุขุมวิท 23 น้ำ 180 กก. ส่งก่อน 11:30 โทร 089-412-8831"
          />
        ) : (
          <div className="upload-box">
            {imageDataUrl ? (
              <>
                <img
                  src={imageDataUrl}
                  alt="ตัวอย่างใบส่งของ SME"
                  className="upload-preview"
                />
                <div className="upload-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus size={14} />
                    <span>เปลี่ยนรูปภาพ</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onChangeImage(null)}
                  >
                    <Trash2 size={14} />
                    <span>ลบรูป</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <Camera size={24} color="var(--pine-700)" />
                <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  อัปโหลดภาพถ่ายใบส่งของ / แคปแชต LINE (PNG, JPG)
                  <br />
                  <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                    รองรับ Gemini Vision Multimodal + Offline Smart Fallback
                  </span>
                </div>
                <div className="upload-actions">
                  <button
                    id="btn-upload-receipt"
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus size={14} />
                    <span>เลือกไฟล์รูปภาพ</span>
                  </button>
                  <button
                    id="btn-sample-receipt"
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleCreateSampleReceipt}
                  >
                    <Sparkles size={14} />
                    <span>สร้างรูปใบส่งของตัวอย่าง</span>
                  </button>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Fleet Constraints */}
        <div className="fleet-config">
          <div className="input-field">
            <label htmlFor="cfg-weight">น้ำหนักบรรทุกสูงสุด (กก./คัน)</label>
            <input
              id="cfg-weight"
              type="number"
              min="200"
              max="10000"
              step="50"
              className="input-control mono"
              value={fleetConfig.maxWeightKg}
              onChange={(e) =>
                onChangeFleetConfig({
                  ...fleetConfig,
                  maxWeightKg: Number(e.target.value) || 1000,
                })
              }
            />
          </div>
          <div className="input-field">
            <label htmlFor="cfg-trucks">รถที่ใช้ปกติก่อนจัดสาย (คัน)</label>
            <input
              id="cfg-trucks"
              type="number"
              min="1"
              max="10"
              className="input-control mono"
              value={fleetConfig.truckCount}
              onChange={(e) =>
                onChangeFleetConfig({
                  ...fleetConfig,
                  truckCount: Math.max(1, Number(e.target.value) || 3),
                })
              }
            />
          </div>
          <div className="input-field">
            <label htmlFor="cfg-kml">อัตราสิ้นเปลือง (กม./ลิตร)</label>
            <input
              id="cfg-kml"
              type="number"
              min="3"
              max="20"
              step="0.5"
              className="input-control mono"
              value={fleetConfig.fuelKmPerLiter}
              onChange={(e) =>
                onChangeFleetConfig({
                  ...fleetConfig,
                  fuelKmPerLiter: Number(e.target.value) || 9,
                })
              }
            />
          </div>
          <div className="input-field">
            <label htmlFor="cfg-diesel">ราคาน้ำมันดีเซล (บาท/ลิตร)</label>
            <input
              id="cfg-diesel"
              type="number"
              min="20"
              max="60"
              step="0.5"
              className="input-control mono"
              value={fleetConfig.dieselPricePerLiter}
              onChange={(e) =>
                onChangeFleetConfig({
                  ...fleetConfig,
                  dieselPricePerLiter: Number(e.target.value) || 33,
                })
              }
            />
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button
            id="btn-extract-orders"
            type="button"
            className="btn btn-primary btn-lg btn-full"
            onClick={onExtract}
            disabled={isExtracting || (inputMode === 'text' && !rawChat.trim())}
          >
            <Sparkles size={16} />
            <span>
              {isExtracting
                ? 'กำลังแกะข้อมูล + ทำ PDPA Masking...'
                : 'แกะออเดอร์ด้วย AI (Gemini + Offline Fallback)'}
            </span>
          </button>
        </div>

        {telemetry && (
          <div
            className={`notice ${telemetry.mode === 'gemini-live' ? 'info' : 'warn'}`}
            role="status"
          >
            {telemetry.mode === 'gemini-live' ? (
              <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            ) : (
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            )}
            <div>
              <strong>{telemetry.engineLabel}</strong>{' '}
              <span className="mono">({telemetry.latencyMs} ms)</span>
              {telemetry.fallbackReason && (
                <div style={{ marginTop: 2 }}>{telemetry.fallbackReason}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

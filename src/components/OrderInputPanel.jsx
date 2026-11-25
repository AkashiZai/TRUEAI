import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  MessageSquareText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DEMO_PRESETS, generateSampleThaiReceiptImage } from '../data/demoPresets';
import { applyVisualRedaction, REDACTION_PRESETS } from '../engine/imageRedactor';

export default function OrderInputPanel({
  activePresetId,
  onSelectPreset,
  inputMode,
  onChangeInputMode,
  rawChat,
  onChangeRawChat,
  rawImageDataUrl,
  redactedImageDataUrl,
  onChangeImages,
  fleetConfig,
  onChangeFleetConfig,
  onExtract,
  isExtracting,
  telemetry,
}) {
  const fileInputRef = useRef(null);
  const previewWrapRef = useRef(null);

  const [redactionPresetId, setRedactionPresetId] = useState('phone-column');
  const [customBoxes, setCustomBoxes] = useState([]);
  const [showRawPreview, setShowRawPreview] = useState(false);
  const [dragBox, setDragBox] = useState(null);

  const activePresetBoxes =
    REDACTION_PRESETS.find((p) => p.id === redactionPresetId)?.boxes || [];
  const allBoxes = [...activePresetBoxes, ...customBoxes];

  // Re-burn redacted PNG on client canvas whenever raw image or blackout boxes change
  useEffect(() => {
    let cancelled = false;
    if (!rawImageDataUrl) return;
    const presetBoxes =
      REDACTION_PRESETS.find((p) => p.id === redactionPresetId)?.boxes || [];
    const boxesToBurn = [...presetBoxes, ...customBoxes];
    applyVisualRedaction(rawImageDataUrl, boxesToBurn).then((redactedUrl) => {
      if (!cancelled) {
        onChangeImages({
          raw: rawImageDataUrl,
          redacted: redactedUrl,
          boxCount: boxesToBurn.length,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rawImageDataUrl, redactionPresetId, customBoxes, onChangeImages]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomBoxes([]);
        setShowRawPreview(false);
        onChangeImages({ raw: reader.result, redacted: reader.result, boxCount: 0 });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateSampleReceipt = () => {
    const dataUrl = generateSampleThaiReceiptImage();
    setRedactionPresetId('phone-column');
    setCustomBoxes([]);
    setShowRawPreview(false);
    onChangeImages({ raw: dataUrl, redacted: dataUrl, boxCount: 1 });
  };

  // Interactive click-and-drag custom PDPA blackout box on preview image
  const handlePointerDown = (e) => {
    if (!previewWrapRef.current || showRawPreview) return;
    const rect = previewWrapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragBox({ startX: x, startY: y, currX: x, currY: y });
  };

  const handlePointerMove = (e) => {
    if (!dragBox || !previewWrapRef.current) return;
    const rect = previewWrapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    setDragBox((prev) => (prev ? { ...prev, currX: x, currY: y } : null));
  };

  const handlePointerUp = () => {
    if (!dragBox) return;
    const x = Math.min(dragBox.startX, dragBox.currX);
    const y = Math.min(dragBox.startY, dragBox.currY);
    const w = Math.abs(dragBox.currX - dragBox.startX);
    const h = Math.abs(dragBox.currY - dragBox.startY);
    setDragBox(null);
    if (w > 0.03 && h > 0.03) {
      setCustomBoxes((prev) => [...prev, { x, y, w, h, tag: 'PDPA MASK' }]);
    }
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
            {rawImageDataUrl ? (
              <>
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 11.5,
                      fontWeight: 600,
                      color: 'var(--pine-800)',
                    }}
                  >
                    <ShieldCheck size={14} />
                    Client-Side Visual Redaction ({allBoxes.length} จุดปิดบัง)
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowRawPreview((v) => !v)}
                  >
                    {showRawPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                    <span>{showRawPreview ? 'ดูภาพที่ปิด PII แล้ว' : 'ดูภาพต้นฉบับ'}</span>
                  </button>
                </div>

                {/* Preset Redaction Mode Selector */}
                <div style={{ width: '100%', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select
                    aria-label="รูปแบบการปิดบังข้อมูลส่วนบุคคลบนภาพ"
                    className="input-control"
                    style={{ fontSize: 11.5, padding: '5px 8px', flex: 1 }}
                    value={redactionPresetId}
                    onChange={(e) => setRedactionPresetId(e.target.value)}
                  >
                    {REDACTION_PRESETS.map((rp) => (
                      <option key={rp.id} value={rp.id}>
                        {rp.label}
                      </option>
                    ))}
                  </select>
                  {customBoxes.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCustomBoxes([])}
                      title="ล้างกรอบที่ลากเพิ่มเอง"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                </div>

                {/* Interactive Redaction Canvas Preview */}
                <div
                  ref={previewWrapRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    maxWidth: '100%',
                    cursor: showRawPreview ? 'default' : 'crosshair',
                    userSelect: 'none',
                  }}
                  title={
                    showRawPreview
                      ? 'ภาพต้นฉบับ (เก็บไว้เฉพาะในเครื่องลูกค้า)'
                      : 'ลากเมาส์บนภาพเพื่อคาดแถบดำปิดข้อมูลส่วนตัวเพิ่มก่อนส่ง Gemini Vision'
                  }
                >
                  <img
                    src={showRawPreview ? rawImageDataUrl : redactedImageDataUrl || rawImageDataUrl}
                    alt="ตัวอย่างใบส่งของ SME ที่ผ่านการปิดบังข้อมูลส่วนบุคคล"
                    className="upload-preview"
                    draggable={false}
                    style={{ display: 'block', maxHeight: 225 }}
                  />
                  {dragBox && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(dragBox.startX, dragBox.currX) * 100}%`,
                        top: `${Math.min(dragBox.startY, dragBox.currY) * 100}%`,
                        width: `${Math.abs(dragBox.currX - dragBox.startX) * 100}%`,
                        height: `${Math.abs(dragBox.currY - dragBox.startY) * 100}%`,
                        background: 'rgba(11, 25, 19, 0.72)',
                        border: '1.5px solid #6ee7b7',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </div>

                <div style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                  {showRawPreview
                    ? 'ภาพต้นฉบับนี้จะไม่ถูกส่งออก Cloud — ระบบส่งเฉพาะภาพที่คาดแถบดำแล้วเท่านั้น'
                    : 'ลากเมาส์บนภาพเพื่อคาดแถบดำปิดจุดอื่นเพิ่มได้ · เบอร์โทรและชื่อผู้ติดต่อถูกลบพิกเซลบนเครื่องแล้ว'}
                </div>

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
                    onClick={() => {
                      setCustomBoxes([]);
                      onChangeImages({ raw: null, redacted: null, boxCount: 0 });
                    }}
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
                    ระบบทำ Client-Side Visual PII Redaction บนเบราว์เซอร์ก่อนส่ง Gemini Vision
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
                : inputMode === 'image'
                  ? 'ส่งภาพที่ปิด PII แล้วเข้า AI (Gemini Vision + Fallback)'
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

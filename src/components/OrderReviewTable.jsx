import { useState } from 'react';
import { Check, MapPin, Play, Plus, Trash2 } from 'lucide-react';
import { matchBangkokLocation } from '../data/bangkokLocations';
import { clampFinite, sanitizePlainText } from '../engine/securityUtils';

export default function OrderReviewTable({
  orders,
  onUpdateOrder,
  onDeleteOrder,
  onAddQuickOrder,
  onRunOptimize,
  isOptimizing,
}) {
  const [quickInput, setQuickInput] = useState('');
  const needsReviewCount = orders.filter((o) => !o.verified || o.confidence < 85).length;
  const totalWeight = orders.reduce((s, o) => s + (Number(o.weightKg) || 0), 0);

  const handleQuickAdd = (e) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    onAddQuickOrder(quickInput.trim().slice(0, 500));
    setQuickInput('');
  };

  return (
    <section className="panel" aria-label="ตรวจสอบข้อมูลออเดอร์โดยมนุษย์">
      <div className="panel-header">
        <div className="panel-title-group">
          <span className="step-badge">2</span>
          <div>
            <h2 className="panel-title">
              ตรวจสอบออเดอร์ (Human-in-the-Loop)
            </h2>
            <p className="panel-subtitle mono">
              {orders.length} จุดส่ง · น้ำหนักรวม {totalWeight.toLocaleString('th-TH')} กก.
            </p>
          </div>
        </div>
        {needsReviewCount > 0 && (
          <span className="conf-badge low">ต้องตรวจ {needsReviewCount} รายการ</span>
        )}
      </div>

      {/* Quick live Q&A add order bar */}
      <form
        onSubmit={handleQuickAdd}
        style={{
          display: 'flex',
          gap: 6,
          padding: '10px 14px',
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border-hairline)',
        }}
      >
        <input
          id="input-quick-add"
          type="text"
          maxLength={500}
          className="input-control"
          style={{ fontSize: 12 }}
          value={quickInput}
          onChange={(e) => setQuickInput(e.target.value)}
          placeholder="เพิ่มจุดส่งด่วนตอน Q&A เช่น: ร้านสมชาย ดอนเมือง 200 กก. ก่อน 10:30"
        />
        <button id="btn-quick-add" type="submit" className="btn btn-secondary btn-sm">
          <Plus size={14} />
          <span>เพิ่ม</span>
        </button>
      </form>

      <div className="order-list">
        {orders.map((order, idx) => {
          const flagged = !order.verified || order.confidence < 85;
          return (
            <div
              key={order.id}
              className={`order-item ${flagged ? 'needs-review' : ''}`}
            >
              <div className="order-item-top">
                <div className="order-name">
                  <span className="order-index">#{idx + 1}</span>
                  <span>{order.customerName}</span>
                </div>
                <span className={`conf-badge mono ${flagged ? 'low' : 'high'}`}>
                  AI {order.confidence}%
                </span>
              </div>

              <div className="order-address">
                <MapPin size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                {order.matchedArea} · <span style={{ color: 'var(--ink-muted)' }}>{order.itemsSummary}</span>
              </div>

              <div className="order-controls">
                <input
                  type="number"
                  min="5"
                  max="5000"
                  aria-label={`น้ำหนัก ${order.customerName}`}
                  className="order-mini-input mono"
                  value={order.weightKg}
                  onChange={(e) =>
                    onUpdateOrder(order.id, {
                      weightKg: Math.round(clampFinite(e.target.value, 5, 5000, 50)),
                    })
                  }
                  title="น้ำหนัก (กก.)"
                />
                <input
                  type="text"
                  maxLength={140}
                  aria-label={`ที่อยู่ ${order.customerName}`}
                  className="order-mini-input"
                  value={order.addressText}
                  onChange={(e) => {
                    const nextAddr = sanitizePlainText(e.target.value, {
                      maxLen: 140,
                      singleLine: true,
                      trim: false,
                    });
                    const geo = matchBangkokLocation(nextAddr);
                    onUpdateOrder(order.id, {
                      addressText: nextAddr,
                      matchedArea: geo.matched ? geo.label : order.matchedArea,
                      lat: geo.matched ? geo.lat : order.lat,
                      lng: geo.matched ? geo.lng : order.lng,
                    });
                  }}
                  onBlur={(e) => {
                    const trimmed = sanitizePlainText(e.target.value, {
                      maxLen: 140,
                      singleLine: true,
                      trim: true,
                    });
                    if (trimmed !== order.addressText) {
                      onUpdateOrder(order.id, { addressText: trimmed });
                    }
                  }}
                  title="ย่าน/ที่อยู่ (พิมพ์ชื่อย่าน กทม. เพื่ออัปเดตพิกัดอัตโนมัติ)"
                />
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                    {order.timeStart}–{order.timeEnd}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px 6px' }}
                    onClick={() => onDeleteOrder(order.id)}
                    aria-label={`ลบ ${order.customerName}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {flagged && (
                <div className="order-note">
                  <span>{order.reviewReason || 'กรุณาตรวจสอบน้ำหนักและพิกัดก่อนจัดสาย'}</span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      onUpdateOrder(order.id, {
                        verified: true,
                        confidence: 99,
                        reviewReason: '',
                      })
                    }
                  >
                    <Check size={12} />
                    <span>ยืนยัน</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="review-footer">
        <button
          id="btn-run-optimize"
          type="button"
          className="btn btn-primary btn-lg btn-full"
          onClick={onRunOptimize}
          disabled={isOptimizing || orders.length === 0}
        >
          <Play size={15} />
          <span>
            {isOptimizing
              ? 'กำลังคำนวณ CVRPTW + ดึงเส้นทางถนนจริง...'
              : 'จัดเส้นทาง CVRPTW + คำนวณคาร์บอน TGO'}
          </span>
        </button>
      </div>
    </section>
  );
}

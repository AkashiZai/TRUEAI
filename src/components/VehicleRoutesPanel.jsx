import { Copy, ExternalLink, Package, Truck } from 'lucide-react';

export default function VehicleRoutesPanel({
  optimization,
  metrics,
  selectedVehicleId,
  onSelectVehicle,
  onCopyDriverPlan,
}) {
  if (!optimization || !metrics) return null;

  const { afterRoutes } = optimization;
  const { distance, fuel, carbon, fleet } = metrics;

  return (
    <section className="panel" aria-label="แผนการเดินรถและการเรียงสินค้าแบบ LIFO">
      <div className="panel-header">
        <div className="panel-title-group">
          <Truck size={16} color="var(--pine-800)" />
          <div>
            <h2 className="panel-title">
              แผนเดินรถที่เหมาะสมที่สุด + ลำดับเรียงของแบบ LIFO ({afterRoutes.length} คัน)
            </h2>
            <p className="panel-subtitle">
              ส่งลิงก์นำทางให้คนขับได้ทันที และเรียงสินค้าที่ต้องส่งลำดับแรกไว้ท้ายรถเพื่อลดเวลาจอดติดเครื่อง
            </p>
          </div>
        </div>
        {selectedVehicleId && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onSelectVehicle(null)}
          >
            แสดงรถทุกคัน
          </button>
        )}
      </div>

      <div className="fleet-grid">
        {afterRoutes.map((route) => {
          const isSelected = selectedVehicleId === route.vehicleId;
          return (
            <article
              key={route.vehicleId}
              className={`vehicle-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() =>
                onSelectVehicle(isSelected ? null : route.vehicleId)
              }
            >
              <div className="vehicle-head">
                <div className="vehicle-badge">
                  <span className="vehicle-dot" style={{ background: route.color }} />
                  <span>{route.vehicleName}</span>
                </div>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                  {route.departTime} – {route.returnTime}
                </span>
              </div>

              <div className="vehicle-stats">
                <div className="vstat">
                  <span className="vstat-label">ระยะทาง</span>
                  <span className="vstat-val mono">{route.distanceKm} กม.</span>
                </div>
                <div className="vstat">
                  <span className="vstat-label">จุดส่ง</span>
                  <span className="vstat-val mono">{route.stops.length} จุด</span>
                </div>
                <div className="vstat">
                  <span className="vstat-label">บรรทุก</span>
                  <span className="vstat-val mono">{route.loadPct}%</span>
                </div>
              </div>

              <div className="load-bar-wrap">
                <div className="field-label" style={{ fontSize: 11 }}>
                  <span>น้ำหนักบรรทุก (Capacity)</span>
                  <span className="mono">
                    {route.totalWeightKg.toLocaleString('th-TH')} /{' '}
                    {route.maxWeightKg.toLocaleString('th-TH')} กก.
                  </span>
                </div>
                <div className="load-bar-track">
                  <div
                    className="load-bar-fill"
                    style={{
                      width: `${Math.min(100, route.loadPct)}%`,
                      background: route.color,
                    }}
                  />
                </div>
              </div>

              <div className="stop-timeline">
                {route.stops.map((stop) => (
                  <div key={stop.id} className="stop-row">
                    <span className="stop-num" style={{ background: route.color }}>
                      {stop.stopNumber}
                    </span>
                    <div className="stop-info">
                      <strong>{stop.customerName}</strong>
                      <span>
                        {stop.matchedArea} · {stop.weightKg} กก.
                      </span>
                    </div>
                    <div className="stop-meta mono">
                      <div>ETA {stop.eta}</div>
                      <div style={{ fontSize: 10, color: stop.isLate ? 'var(--red-ink)' : 'var(--pine-700)' }}>
                        {stop.isLate ? 'เกินเวลา' : 'ตรงเวลา'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* LIFO Cargo Bay Order */}
              <div className="lifo-box">
                <div className="lifo-label">
                  <span>
                    <Package size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
                    ลำดับยกของขึ้นรถ (LIFO)
                  </span>
                  <span>ชิดหัวเก๋ง → ท้ายรถ</span>
                </div>
                <div className="lifo-bay">
                  {route.lifoOrder.map((slot) => (
                    <div
                      key={slot.stopNumber}
                      className="lifo-slot"
                      title={`${slot.positionLabel}: จุดส่ง #${slot.stopNumber} ${slot.customerName}`}
                    >
                      <strong className="mono">จุด #{slot.stopNumber}</strong>
                      <span className="mono">{slot.weightKg} kg</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="vehicle-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => onCopyDriverPlan(route)}
                >
                  <Copy size={13} />
                  <span>คัดลอกส่ง LINE คนขับ</span>
                </button>
                <a
                  href={route.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-ghost btn-sm"
                  style={{ textDecoration: 'none' }}
                >
                  <ExternalLink size={13} />
                  <span>Maps</span>
                </a>
              </div>
            </article>
          );
        })}
      </div>

      {/* Crisp Before vs After Table for Pitch Screenshots */}
      <div style={{ borderTop: '1px solid var(--border-hairline)', overflowX: 'auto' }}>
        <table className="before-after-table">
          <thead>
            <tr>
              <th>ตัวชี้วัดเปรียบเทียบ (ต่อวันทำงาน)</th>
              <th>ก่อนจัดสาย (จัดมือแบบเดิม)</th>
              <th>หลังจัดสาย (GreenRoute AI)</th>
              <th>ผลลัพธ์ที่ประหยัดได้</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>ระยะทางวิ่งรวมทั้งฟลีต</td>
              <td className="mono">{distance.beforeKm} กม.</td>
              <td className="mono">{distance.afterKm} กม.</td>
              <td className="mono delta-positive">
                -{distance.savedKm} กม. (-{distance.savedPct}%)
              </td>
            </tr>
            <tr>
              <td>จำนวนรถที่ใช้ &amp; อัตราบรรทุกเฉลี่ย</td>
              <td className="mono">
                {fleet.beforeTrucksUsed} คัน ({fleet.beforeAvgLoadPct}%)
              </td>
              <td className="mono">
                {fleet.afterTrucksUsed} คัน ({fleet.afterAvgLoadPct}%)
              </td>
              <td className="delta-positive">
                {fleet.trucksEliminated > 0
                  ? `ลดรถได้ ${fleet.trucksEliminated} คันเต็ม!`
                  : `เพิ่มความจุ +${fleet.loadGainPct}%`}
              </td>
            </tr>
            <tr>
              <td>ค่าน้ำมันดีเซล (วัน / เดือน)</td>
              <td className="mono">{fuel.beforeCostDay.toLocaleString('th-TH')} ฿/วัน</td>
              <td className="mono">{fuel.afterCostDay.toLocaleString('th-TH')} ฿/วัน</td>
              <td className="mono delta-positive">
                -{fuel.savedCostDay.toLocaleString('th-TH')} ฿/วัน (
                {fuel.savedCostMonth.toLocaleString('th-TH')} ฿/เดือน)
              </td>
            </tr>
            <tr>
              <td>การปล่อยก๊าซเรือนกระจก (TGO Scope 1)</td>
              <td className="mono">{carbon.beforeScope1Day} kgCO₂e</td>
              <td className="mono">{carbon.afterScope1Day} kgCO₂e</td>
              <td className="mono delta-positive">
                -{carbon.savedScope1Day} kgCO₂e/วัน (-{carbon.savedScope1Month} kg/เดือน)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

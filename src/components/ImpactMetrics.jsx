import { Fuel, Leaf, Route, Truck } from 'lucide-react';

export default function ImpactMetrics({ metrics }) {
  if (!metrics) return null;

  const { distance, fuel, carbon, fleet } = metrics;

  return (
    <section className="kpi-strip" aria-label="ผลลัพธ์การประหยัดต้นทุนและลดคาร์บอน">
      <article className="kpi-card">
        <div className="kpi-label">
          <span>ลดระยะทางวิ่งรวม (Distance Saved)</span>
          <Route size={15} />
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value mono">-{distance.savedPct}%</span>
          <span className="kpi-delta mono">-{distance.savedKm} กม./วัน</span>
        </div>
        <div className="kpi-meta mono">
          <span>เดิม {distance.beforeKm} กม. → ใหม่ {distance.afterKm} กม.</span>
        </div>
      </article>

      <article className="kpi-card">
        <div className="kpi-label">
          <span>ประหยัดค่าน้ำมัน (Fuel ROI)</span>
          <Fuel size={15} />
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value mono">
            {fuel.savedCostMonth.toLocaleString('th-TH')} ฿
          </span>
          <span className="kpi-delta">/ เดือน</span>
        </div>
        <div className="kpi-meta">
          <span className="mono">{fuel.savedCostDay.toLocaleString('th-TH')} ฿/วัน ({fuel.savedLitersDay} ลิตร)</span>
          <span className="mono">{fuel.savedCostYear.toLocaleString('th-TH')} ฿/ปี</span>
        </div>
      </article>

      <article className="kpi-card is-highlight">
        <div className="kpi-label">
          <span>ลดก๊าซเรือนกระจก (TGO Standard)</span>
          <Leaf size={15} />
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value mono">{carbon.savedScope1Month.toLocaleString('th-TH')}</span>
          <span className="kpi-delta mono">kgCO₂e / เดือน</span>
        </div>
        <div className="kpi-meta">
          <span className="mono">Scope 3 (WTW): {carbon.savedWtwMonth} kg</span>
          <span>≈ ปลูกต้นไม้ {carbon.treesEquivalentYear} ต้น/ปี</span>
        </div>
      </article>

      <article className="kpi-card">
        <div className="kpi-label">
          <span>ประสิทธิภาพรถ (Load Factor)</span>
          <Truck size={15} />
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value mono">{fleet.afterAvgLoadPct}%</span>
          {fleet.trucksEliminated > 0 ? (
            <span className="kpi-delta">ลดรถได้ {fleet.trucksEliminated} คัน!</span>
          ) : (
            <span className="kpi-delta">+{Math.max(0, fleet.loadGainPct)}% Load</span>
          )}
        </div>
        <div className="kpi-meta">
          <span className="mono">
            ใช้รถ {fleet.beforeTrucksUsed} → {fleet.afterTrucksUsed} คัน
          </span>
          <span className="mono">เดิมเฉลี่ย {fleet.beforeAvgLoadPct}%</span>
        </div>
      </article>
    </section>
  );
}

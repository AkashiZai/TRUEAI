import { Download, Leaf, Printer, ShieldCheck, X } from 'lucide-react';
import { TGO_CONSTANTS } from '../engine/tgoCarbonEngine';
import { stripPIIForExport } from '../engine/piiMasker';
import { clampFinite } from '../engine/securityUtils';

const REPORT_DATE_STR = new Date().toLocaleDateString('th-TH', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export default function CarbonReportModal({
  isOpen,
  onClose,
  preset,
  fleetConfig,
  optimization,
  metrics,
}) {
  if (!isOpen || !optimization || !metrics) return null;

  const { distance, fuel, carbon, fleet } = metrics;
  const todayStr = REPORT_DATE_STR;
  const safeKmPerL = clampFinite(fleetConfig?.fuelKmPerLiter, 2, 30, 9.0);
  const safeDieselPrice = clampFinite(fleetConfig?.dieselPricePerLiter, 10, 100, 33.0);

  const handleDownloadJson = () => {
    // PDPA-Safe B2B ESG Export: never include unmasked customer names, phone numbers, or raw chat text
    const payload = {
      reportTitle: 'GreenRoute AI — TGO Carbon Reduction & Green Logistics Audit Report',
      privacyCompliance: 'PDPA-Anonymized B2B Scope 3 Export (Zero Customer PII)',
      generatedAt: new Date().toISOString(),
      organization: preset.businessName,
      depot: preset.depot.name,
      standardReference: TGO_CONSTANTS.REFERENCE_LABEL,
      emissionFactors: {
        scope1DieselKgCo2ePerLiter: TGO_CONSTANTS.DIESEL_EF_SCOPE1,
        wellToWheelScope3DieselKgCo2ePerLiter: TGO_CONSTANTS.DIESEL_EF_WTW_SCOPE3,
      },
      fleetAssumptions: {
        vehicleType: fleetConfig.vehicleType,
        maxWeightKg: clampFinite(fleetConfig.maxWeightKg, 200, 20000, 1000),
        fuelKmPerLiter: safeKmPerL,
        dieselPricePerLiter: safeDieselPrice,
      },
      comparisonMetrics: metrics,
      optimizedRoutes: optimization.afterRoutes.map((r, rIdx) => ({
        vehicleId: `VEH-${String(rIdx + 1).padStart(2, '0')}`,
        vehicle: r.vehicleName,
        distanceKm: r.distanceKm,
        totalWeightKg: r.totalWeightKg,
        loadUtilizationPct: r.loadPct,
        stopCount: r.stops.length,
        anonymizedStops: r.stops.map((s) => ({
          stopId: `STOP-${String(s.stopNumber).padStart(2, '0')}`,
          zoneSummary: stripPIIForExport(s.matchedArea || '-'),
          weightKg: s.weightKg,
          eta: s.eta,
        })),
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `greenroute-tgo-report-${preset.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Leaf size={20} color="var(--pine-800)" />
            <div>
              <h2>รายงานคาร์บอนฟุตพริ้นท์การขนส่ง (TGO Scope 1 &amp; Scope 3)</h2>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {preset.businessName} · ออกรายงานวันที่ {todayStr}
              </div>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-sm no-print" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="report-summary-grid">
            <div className="report-stat">
              <div className="report-stat-label">ลด CO₂e (Scope 1 · รายปี)</div>
              <div className="report-stat-val mono">
                {(carbon.savedScope1Year / 1000).toFixed(2)} ตัน
              </div>
              <div className="report-stat-sub mono">
                {carbon.savedScope1Day} kg/วัน · {carbon.savedScope1Month} kg/เดือน
              </div>
            </div>

            <div className="report-stat">
              <div className="report-stat-label">ลด CO₂e (Scope 3 WTW · รายปี)</div>
              <div className="report-stat-val mono">
                {(carbon.savedWtwYear / 1000).toFixed(2)} ตัน
              </div>
              <div className="report-stat-sub">สำหรับส่งรายงานคู่ค้า B2B / Supply Chain</div>
            </div>

            <div className="report-stat">
              <div className="report-stat-label">ประหยัดค่าน้ำมันสุทธิ (รายปี)</div>
              <div className="report-stat-val mono">
                {fuel.savedCostYear.toLocaleString('th-TH')} ฿
              </div>
              <div className="report-stat-sub">
                เทียบเท่าดูดซับ CO₂ ของต้นไม้ {carbon.treesEquivalentYear} ต้น/ปี
              </div>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13.5 }}>
              สูตรและค่าอ้างอิงมาตรฐาน (Deterministic Audit Trail — ไม่มี LLM คำนวณเลข)
            </h3>
            <div className="code-block">
{`สูตรมาตรฐาน อบก. (TGO): GHG (kgCO2e) = ปริมาณเชื้อเพลิง (ลิตร) × Emission Factor (EF)
• แหล่งอ้างอิง: ${TGO_CONSTANTS.REFERENCE_LABEL}
• EF น้ำมันดีเซล (Scope 1 Mobile Combustion) = ${TGO_CONSTANTS.DIESEL_EF_SCOPE1} kgCO2e / ลิตร
• EF น้ำมันดีเซล (Well-to-Wheel / Scope 3)  = ${TGO_CONSTANTS.DIESEL_EF_WTW_SCOPE3} kgCO2e / ลิตร
• สมมติฐานฟลีต: ${fleetConfig.vehicleType} | อัตราสิ้นเปลือง ${safeKmPerL} กม./ลิตร | ดีเซล ${safeDieselPrice} บาท/ลิตร
• เชื้อเพลิงที่ลดได้วันนี้: (${distance.beforeKm} - ${distance.afterKm}) กม. ÷ ${safeKmPerL} = ${fuel.savedLitersDay} ลิตร
• คาร์บอนที่ลดได้วันนี้ (Scope 1): ${fuel.savedLitersDay} × ${TGO_CONSTANTS.DIESEL_EF_SCOPE1} = ${carbon.savedScope1Day} kgCO2e`}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: 13.5 }}>
              รายละเอียดการปล่อยก๊าซเรือนกระจกรายคัน (หลังจัดสายด้วย GreenRoute AI)
            </h3>
            <table className="before-after-table" style={{ border: '1px solid var(--border-hairline)' }}>
              <thead>
                <tr>
                  <th>รถจัดส่ง</th>
                  <th>จุดส่ง</th>
                  <th>น้ำหนักบรรทุก</th>
                  <th>ระยะทาง</th>
                  <th>น้ำมันที่ใช้</th>
                  <th>Scope 1 (kgCO₂e)</th>
                </tr>
              </thead>
              <tbody>
                {optimization.afterRoutes.map((r) => {
                  const liters = r.distanceKm / safeKmPerL;
                  const co2 = liters * TGO_CONSTANTS.DIESEL_EF_SCOPE1;
                  return (
                    <tr key={r.vehicleId}>
                      <td>
                        <strong>{r.vehicleName}</strong>
                      </td>
                      <td className="mono">{r.stops.length} จุด</td>
                      <td className="mono">
                        {r.totalWeightKg} กก. ({r.loadPct}%)
                      </td>
                      <td className="mono">{r.distanceKm} กม.</td>
                      <td className="mono">{liters.toFixed(2)} ลิตร</td>
                      <td className="mono">{co2.toFixed(2)} kg</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--pine-800)',
              background: 'var(--pine-50)',
              padding: '8px 10px',
              borderRadius: 8,
            }}
          >
            <ShieldCheck size={14} style={{ flexShrink: 0 }} />
            <span>
              PDPA Safe Export: ไฟล์ ESG JSON สำหรับส่งคู่ค้า B2B จะตัดชื่อบุคคลและเบอร์โทรลูกค้าออกทั้งหมดโดยอัตโนมัติ
            </span>
          </div>

          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            หมายเหตุ: การประเมินรายเดือนคำนวณบนฐาน {TGO_CONSTANTS.WORKING_DAYS_PER_MONTH} วันทำงาน/เดือน
            ({TGO_CONSTANTS.WORKING_DAYS_PER_YEAR} วัน/ปี) ลดการใช้รถลง {fleet.trucksEliminated} คัน
            จากเดิม {fleet.beforeTrucksUsed} คัน เหลือ {fleet.afterTrucksUsed} คัน
          </div>
        </div>

        <div className="modal-footer no-print">
          <button type="button" className="btn btn-secondary" onClick={handleDownloadJson}>
            <Download size={14} />
            <span>ดาวน์โหลด ESG JSON (PDPA-Safe)</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={14} />
            <span>พิมพ์ / บันทึกเป็น PDF (A4)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

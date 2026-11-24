import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { DEMO_PRESETS } from './data/demoPresets';
import { maskPII } from './engine/piiMasker';
import { extractOrdersHybrid, parseOrdersOffline } from './engine/orderExtractor';
import { enrichWithOSRMRoads, runFleetOptimization } from './engine/cvrptwSolver';
import { calculateCarbonAndSavings } from './engine/tgoCarbonEngine';

import Header from './components/Header';
import ImpactMetrics from './components/ImpactMetrics';
import OrderInputPanel from './components/OrderInputPanel';
import OrderReviewTable from './components/OrderReviewTable';
import RouteMap from './components/RouteMap';
import VehicleRoutesPanel from './components/VehicleRoutesPanel';
import CarbonReportModal from './components/CarbonReportModal';
import GuardrailModal from './components/GuardrailModal';
import ApiSettingsModal from './components/ApiSettingsModal';

const STORAGE_KEY_API = 'greenroute_gemini_api_key';
const STORAGE_KEY_MODEL = 'greenroute_gemini_model';
const STORAGE_KEY_OFFLINE = 'greenroute_force_offline';

function buildInitialState(preset) {
  const piiReport = maskPII(preset.rawChat);
  const orders = parseOrdersOffline(preset.rawChat, piiReport.vault, false);
  const optimization = runFleetOptimization(orders, preset.depot, preset.fleet);
  return {
    piiReport,
    orders,
    optimization,
    telemetry: {
      mode: 'offline-fallback',
      engineLabel: 'Offline Smart Fallback · Ready',
      fallbackReason: null,
      latencyMs: 12,
      usedImage: false,
      modelUsed: 'Thai-NLP-Heuristic-v2',
    },
  };
}

export default function App() {
  const defaultPreset = DEMO_PRESETS[0];
  const initial = useMemo(() => buildInitialState(defaultPreset), [defaultPreset]);

  const [activePresetId, setActivePresetId] = useState(defaultPreset.id);
  const [inputMode, setInputMode] = useState('text');
  const [rawChat, setRawChat] = useState(defaultPreset.rawChat);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [fleetConfig, setFleetConfig] = useState(defaultPreset.fleet);

  const [orders, setOrders] = useState(initial.orders);
  const [piiReport, setPiiReport] = useState(initial.piiReport);
  const [telemetry, setTelemetry] = useState(initial.telemetry);
  const [optimization, setOptimization] = useState(initial.optimization);

  const [mapViewMode, setMapViewMode] = useState('after');
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [showGuardrailModal, setShowGuardrailModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Gemini API Settings (persisted locally in browser)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_API) || '');
  const [model, setModel] = useState(
    () => localStorage.getItem(STORAGE_KEY_MODEL) || 'gemini-2.5-flash'
  );
  const [forceOffline, setForceOffline] = useState(
    () => localStorage.getItem(STORAGE_KEY_OFFLINE) === 'true'
  );

  const activePreset = useMemo(
    () => DEMO_PRESETS.find((p) => p.id === activePresetId) || DEMO_PRESETS[0],
    [activePresetId]
  );

  const metrics = useMemo(() => {
    if (!optimization) return null;
    return calculateCarbonAndSavings({
      beforeDistanceKm: optimization.summary.beforeDistanceKm,
      afterDistanceKm: optimization.summary.afterDistanceKm,
      beforeTrucksUsed: optimization.summary.beforeTrucksUsed,
      afterTrucksUsed: optimization.summary.afterTrucksUsed,
      beforeAvgLoadPct: optimization.summary.beforeAvgLoadPct,
      afterAvgLoadPct: optimization.summary.afterAvgLoadPct,
      fuelKmPerLiter: fleetConfig.fuelKmPerLiter,
      dieselPricePerLiter: fleetConfig.dieselPricePerLiter,
    });
  }, [optimization, fleetConfig]);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? '' : prev));
    }, 3200);
  }, []);

  const optimizeAndEnrich = useCallback(async (orderList, depot, cfg) => {
    setIsOptimizing(true);
    setSelectedVehicleId(null);

    const baseResult = runFleetOptimization(orderList, depot, cfg);
    setOptimization(baseResult);

    // Upgrade street polylines via OSRM in background (fails silently offline)
    const enriched = await enrichWithOSRMRoads(baseResult, depot);
    setOptimization(enriched);
    setIsOptimizing(false);
    return enriched;
  }, []);

  // Enrich initial preset routes with real Bangkok OSRM road polylines on mount
  useEffect(() => {
    let cancelled = false;
    enrichWithOSRMRoads(initial.optimization, defaultPreset.depot).then((enriched) => {
      if (!cancelled) setOptimization(enriched);
    });
    return () => {
      cancelled = true;
    };
  }, [initial.optimization, defaultPreset.depot]);

  const handleSelectPreset = async (presetId) => {
    const preset = DEMO_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setActivePresetId(preset.id);
    setRawChat(preset.rawChat);
    setImageDataUrl(null);
    setInputMode('text');
    setFleetConfig(preset.fleet);

    const nextPii = maskPII(preset.rawChat);
    const nextOrders = parseOrdersOffline(preset.rawChat, nextPii.vault, false);
    setPiiReport(nextPii);
    setOrders(nextOrders);
    setTelemetry({
      mode: 'offline-fallback',
      engineLabel: 'Offline Smart Fallback · Preset Loaded',
      fallbackReason: null,
      latencyMs: 14,
      usedImage: false,
      modelUsed: 'Thai-NLP-Heuristic-v2',
    });

    await optimizeAndEnrich(nextOrders, preset.depot, preset.fleet);
    showToast(`โหลดเคส "${preset.title}" และจัดเส้นทางใหม่แล้ว`);
  };

  const handleExtract = async () => {
    setIsExtracting(true);
    try {
      const result = await extractOrdersHybrid({
        rawText: inputMode === 'text' ? rawChat : '',
        imageDataUrl: inputMode === 'image' ? imageDataUrl : null,
        fallbackPresetText: rawChat || activePreset.rawChat,
        apiKey,
        model,
        forceOffline,
      });

      setOrders(result.orders);
      setPiiReport(result.piiReport);
      setTelemetry(result.telemetry);

      if (result.orders.length > 0) {
        await optimizeAndEnrich(result.orders, activePreset.depot, fleetConfig);
        showToast(
          result.telemetry.mode === 'gemini-live'
            ? `Gemini แกะ ${result.orders.length} จุดส่ง + จัดเส้นทางสำเร็จ`
            : `Offline Smart Fallback แกะ ${result.orders.length} จุดส่งสำเร็จ`
        );
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleUpdateOrder = (id, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const handleDeleteOrder = (id) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const handleAddQuickOrder = async (line) => {
    const pii = maskPII(line);
    const parsed = parseOrdersOffline(line, pii.vault, false);
    if (!parsed.length) return;
    const newOrder = {
      ...parsed[0],
      id: `ord-${Date.now()}`,
    };
    const nextOrders = [...orders, newOrder];
    setOrders(nextOrders);
    await optimizeAndEnrich(nextOrders, activePreset.depot, fleetConfig);
    showToast(`เพิ่ม "${newOrder.customerName}" (${newOrder.matchedArea}) และจัดสายใหม่แล้ว`);
  };

  const handleRunOptimize = async () => {
    await optimizeAndEnrich(orders, activePreset.depot, fleetConfig);
    showToast('อัปเดตเส้นทาง CVRPTW และคาร์บอน TGO เรียบร้อยแล้ว');
  };

  const handleSaveApiSettings = ({ apiKey: nextKey, model: nextModel, forceOffline: nextOff }) => {
    setApiKey(nextKey);
    setModel(nextModel);
    setForceOffline(nextOff);
    localStorage.setItem(STORAGE_KEY_API, nextKey);
    localStorage.setItem(STORAGE_KEY_MODEL, nextModel);
    localStorage.setItem(STORAGE_KEY_OFFLINE, String(nextOff));
    showToast(
      nextOff
        ? 'เปิดโหมด Offline Smart Fallback (Safe Demo Mode) แล้ว'
        : nextKey
          ? `บันทึก Gemini API Key (${nextModel}) แล้ว`
          : 'ล้าง API Key แล้ว — ใช้ Offline Smart Fallback'
    );
  };

  const handleCopyDriverPlan = async (route) => {
    const stopsText = route.stops
      .map(
        (s) =>
          `${s.stopNumber}. ${s.customerName} (${s.matchedArea}) — ${s.weightKg} กก. | ETA ${s.eta} | โทร ${s.phone}`
      )
      .join('\n');

    const lifoText = route.lifoOrder
      .map((slot) => `• ${slot.positionLabel}: จุด #${slot.stopNumber} (${slot.customerName})`)
      .join('\n');

    const message = [
      `🚚 แผนส่งของ GreenRoute AI — ${route.vehicleName}`,
      `คลังต้นทาง: ${activePreset.depot.name}`,
      `ระยะทางรวม: ${route.distanceKm} กม. | น้ำหนัก: ${route.totalWeightKg}/${route.maxWeightKg} กก. (${route.loadPct}%)`,
      '',
      '📍 ลำดับจุดส่ง:',
      stopsText,
      '',
      '📦 ลำดับยกของขึ้นรถ (LIFO):',
      lifoText,
      '',
      `🗺️ เปิดนำทาง Google Maps:\n${route.googleMapsUrl}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(message);
      showToast(`คัดลอกแผนส่งของ ${route.vehicleName} พร้อมลิงก์ Maps แล้ว`);
    } catch {
      showToast('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาลองใหม่');
    }
  };

  return (
    <div className="app-shell">
      <Header
        telemetry={telemetry}
        hasApiKey={Boolean(apiKey || import.meta.env.VITE_GEMINI_API_KEY)}
        forceOffline={forceOffline}
        onOpenReport={() => setShowReportModal(true)}
        onOpenGuardrail={() => setShowGuardrailModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        canOpenReport={Boolean(optimization && metrics)}
      />

      <main className="workspace">
        <ImpactMetrics metrics={metrics} />

        <div className="workspace-grid">
          <div className="column-stack">
            <OrderInputPanel
              activePresetId={activePresetId}
              onSelectPreset={handleSelectPreset}
              inputMode={inputMode}
              onChangeInputMode={setInputMode}
              rawChat={rawChat}
              onChangeRawChat={setRawChat}
              imageDataUrl={imageDataUrl}
              onChangeImage={setImageDataUrl}
              fleetConfig={fleetConfig}
              onChangeFleetConfig={setFleetConfig}
              onExtract={handleExtract}
              isExtracting={isExtracting}
              telemetry={telemetry}
            />

            <OrderReviewTable
              orders={orders}
              onUpdateOrder={handleUpdateOrder}
              onDeleteOrder={handleDeleteOrder}
              onAddQuickOrder={handleAddQuickOrder}
              onRunOptimize={handleRunOptimize}
              isOptimizing={isOptimizing}
            />
          </div>

          <div className="column-stack">
            <RouteMap
              depot={activePreset.depot}
              optimization={optimization}
              mapViewMode={mapViewMode}
              onChangeMapViewMode={setMapViewMode}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
            />

            <VehicleRoutesPanel
              optimization={optimization}
              metrics={metrics}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={setSelectedVehicleId}
              onCopyDriverPlan={handleCopyDriverPlan}
            />
          </div>
        </div>
      </main>

      <CarbonReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        preset={activePreset}
        fleetConfig={fleetConfig}
        optimization={optimization}
        metrics={metrics}
      />

      <GuardrailModal
        isOpen={showGuardrailModal}
        onClose={() => setShowGuardrailModal(false)}
        piiReport={piiReport}
        telemetry={telemetry}
        optimization={optimization}
      />

      <ApiSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        apiKey={apiKey}
        model={model}
        forceOffline={forceOffline}
        onSave={handleSaveApiSettings}
      />

      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          <CheckCircle2 size={16} color="#6ee7b7" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

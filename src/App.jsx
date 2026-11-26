import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { DEMO_PRESETS } from './data/demoPresets';
import { maskPII } from './engine/piiMasker';
import { extractOrdersHybrid, parseOrdersOffline } from './engine/orderExtractor';
import { enrichWithOSRMRoads, runFleetOptimization } from './engine/cvrptwSolver';
import { calculateCarbonAndSavings } from './engine/tgoCarbonEngine';
import {
  ALLOWED_GEMINI_MODELS,
  generateOrderId,
  sanitizeDriverField,
} from './engine/securityUtils';

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

const EMPTY_IMAGE_PRIVACY = {
  raw: null,
  redacted: null,
  boxCount: 0,
  status: 'idle',
  error: '',
};

function readSessionKey() {
  try {
    // Purge any legacy disk-persisted API key from origin-shared localStorage immediately
    localStorage.removeItem(STORAGE_KEY_API);
  } catch {
    // Ignore restricted storage environments
  }
  try {
    return sessionStorage.getItem(STORAGE_KEY_API) || '';
  } catch {
    return '';
  }
}

function readStoredModel() {
  try {
    const val = sessionStorage.getItem(STORAGE_KEY_MODEL) || localStorage.getItem(STORAGE_KEY_MODEL);
    return ALLOWED_GEMINI_MODELS.has(val) ? val : 'gemini-2.5-flash';
  } catch {
    return 'gemini-2.5-flash';
  }
}

function readStoredOffline() {
  try {
    return (
      sessionStorage.getItem(STORAGE_KEY_OFFLINE) === 'true' ||
      localStorage.getItem(STORAGE_KEY_OFFLINE) === 'true'
    );
  } catch {
    return false;
  }
}

function buildInitialState(preset) {
  const piiReport = maskPII(preset.rawChat);
  const orders = parseOrdersOffline(preset.rawChat, piiReport, false);
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
  const optimizeSeqRef = useRef(0);
  const didInitialOsrmRef = useRef(false);

  const [activePresetId, setActivePresetId] = useState(defaultPreset.id);
  const [inputMode, setInputMode] = useState('text');
  const [rawChat, setRawChat] = useState(defaultPreset.rawChat);
  const [imagePrivacy, setImagePrivacy] = useState(EMPTY_IMAGE_PRIVACY);
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

  // Gemini API Key kept strictly in tab-scoped sessionStorage (auto-wiped on tab close)
  const [apiKey, setApiKey] = useState(readSessionKey);
  const [model, setModel] = useState(readStoredModel);
  const [forceOffline, setForceOffline] = useState(readStoredOffline);

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
    }, 3400);
  }, []);

  const optimizeAndEnrich = useCallback(
    async (orderList, depot, cfg, offlineOverride = forceOffline) => {
      const seqId = ++optimizeSeqRef.current;
      setIsOptimizing(true);
      setSelectedVehicleId(null);

      const baseResult = runFleetOptimization(orderList, depot, cfg);
      setOptimization(baseResult);

      // Strictly respect Offline Safe Mode: zero external OSRM requests when offlineOverride is true
      if (offlineOverride) {
        setIsOptimizing(false);
        return { ...baseResult, osrmActive: false };
      }

      const enriched = await enrichWithOSRMRoads(baseResult, depot, {
        forceOffline: offlineOverride,
      });
      if (seqId === optimizeSeqRef.current) {
        setOptimization(enriched);
        setIsOptimizing(false);
      }
      return enriched;
    },
    [forceOffline]
  );

  // One-shot initial OSRM enrichment on mount only (never overwrites active preset/orders on toggle)
  useEffect(() => {
    if (didInitialOsrmRef.current) return;
    didInitialOsrmRef.current = true;
    if (readStoredOffline()) return;
    let cancelled = false;
    const seqId = ++optimizeSeqRef.current;
    enrichWithOSRMRoads(initial.optimization, defaultPreset.depot, {
      forceOffline: false,
    }).then((enriched) => {
      if (!cancelled && seqId === optimizeSeqRef.current) {
        setOptimization(enriched);
      }
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
    setImagePrivacy(EMPTY_IMAGE_PRIVACY);
    setInputMode('text');
    setFleetConfig(preset.fleet);

    const nextPii = maskPII(preset.rawChat);
    const nextOrders = parseOrdersOffline(preset.rawChat, nextPii, false);
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

    await optimizeAndEnrich(nextOrders, preset.depot, preset.fleet, forceOffline);
    showToast(`โหลดเคส "${preset.title}" และจัดเส้นทางใหม่แล้ว`);
  };

  const handleExtract = async () => {
    // PDPA Fail-Closed Guarantee: NEVER send rawImageDataUrl or unredacted images to external API
    if (inputMode === 'image') {
      if (
        imagePrivacy.status !== 'ready' ||
        !imagePrivacy.redacted ||
        imagePrivacy.boxCount < 1
      ) {
        showToast('บล็อกการส่งภาพ (PDPA Fail-Closed): ต้องคาดแถบดำปิด PII อย่างน้อย 1 จุดและรอประมวลผลเสร็จก่อน');
        return;
      }
    }

    setIsExtracting(true);
    try {
      const safeRedactedImage = inputMode === 'image' ? imagePrivacy.redacted : null;
      const result = await extractOrdersHybrid({
        rawText: inputMode === 'text' ? rawChat : '',
        imageDataUrl: safeRedactedImage,
        fallbackPresetText: inputMode === 'image' ? activePreset.rawChat : rawChat || activePreset.rawChat,
        apiKey,
        model,
        forceOffline,
      });

      setOrders(result.orders);
      setPiiReport(result.piiReport);
      setTelemetry(result.telemetry);

      if (result.orders.length > 0) {
        await optimizeAndEnrich(result.orders, activePreset.depot, fleetConfig, forceOffline);
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
    const target = orders.find((o) => o.id === id);
    const remaining = orders.filter((o) => o.id !== id);
    setOrders(remaining);

    // Immediately recompute local routes so deleted customer PII vanishes from Map, Cards & Clipboard
    optimizeSeqRef.current++;
    setSelectedVehicleId(null);
    setOptimization(runFleetOptimization(remaining, activePreset.depot, fleetConfig));

    // Purge deleted customer's PII line from rawChat & piiReport
    if (target && rawChat) {
      const lines = rawChat.split(/\r?\n/);
      let removedOne = false;
      const filteredLines = lines.filter((line) => {
        if (removedOne) return true;
        if (target.phone && target.phone !== '-' && line.includes(target.phone)) {
          removedOne = true;
          return false;
        }
        if (target.customerName && target.customerName.length >= 3 && line.includes(target.customerName)) {
          removedOne = true;
          return false;
        }
        return true;
      });
      if (filteredLines.length !== lines.length) {
        const nextRaw = filteredLines.join('\n');
        setRawChat(nextRaw);
        setPiiReport(maskPII(nextRaw));
      }
    }
  };

  const handleAddQuickOrder = async (line) => {
    const pii = maskPII(line);
    const parsed = parseOrdersOffline(line, pii, false);
    if (!parsed.length) return;
    const newOrder = {
      ...parsed[0],
      id: generateOrderId(),
    };
    const nextOrders = [...orders, newOrder];
    setOrders(nextOrders);
    await optimizeAndEnrich(nextOrders, activePreset.depot, fleetConfig, forceOffline);
    showToast(`เพิ่ม "${newOrder.customerName}" (${newOrder.matchedArea}) และจัดสายใหม่แล้ว`);
  };

  const handleRunOptimize = async () => {
    await optimizeAndEnrich(orders, activePreset.depot, fleetConfig, forceOffline);
    showToast('อัปเดตเส้นทาง CVRPTW และคาร์บอน TGO เรียบร้อยแล้ว');
  };

  const handleSaveApiSettings = ({ apiKey: nextKey, model: nextModel, forceOffline: nextOff }) => {
    const safeModel = ALLOWED_GEMINI_MODELS.has(nextModel) ? nextModel : 'gemini-2.5-flash';
    setApiKey(nextKey);
    setModel(safeModel);
    setForceOffline(nextOff);

    try {
      // Always keep localStorage free of API keys; persist only in tab-scoped sessionStorage
      localStorage.removeItem(STORAGE_KEY_API);
      if (nextKey) {
        sessionStorage.setItem(STORAGE_KEY_API, nextKey);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_API);
      }
      sessionStorage.setItem(STORAGE_KEY_MODEL, safeModel);
      sessionStorage.setItem(STORAGE_KEY_OFFLINE, String(nextOff));
      localStorage.setItem(STORAGE_KEY_OFFLINE, String(nextOff));
    } catch {
      // Ignore storage quota / privacy mode errors
    }

    if (nextOff) {
      // Unconditionally invalidate any in-flight OSRM fetch and recompute purely locally
      optimizeAndEnrich(orders, activePreset.depot, fleetConfig, true);
    }

    showToast(
      nextOff
        ? 'เปิดโหมด Offline Smart Fallback 100% (ปิดทั้ง Gemini & OSRM ภายนอกแล้ว)'
        : nextKey
          ? `บันทึก Gemini API Key (${safeModel}) ใน sessionStorage แล้ว`
          : 'ล้าง API Key ออกจากเซสชันแล้ว — ใช้ Offline Smart Fallback'
    );
  };

  const handleCopyDriverPlan = async (route) => {
    const stopsText = route.stops
      .map(
        (s) =>
          `${s.stopNumber}. ${sanitizeDriverField(s.customerName, 80)} (${sanitizeDriverField(
            s.matchedArea,
            80
          )}) — ${s.weightKg} กก. | ETA ${sanitizeDriverField(s.eta, 16)} | โทร ${sanitizeDriverField(
            s.phone,
            24
          )}`
      )
      .join('\n');

    const lifoText = route.lifoOrder
      .map(
        (slot) =>
          `• ${sanitizeDriverField(slot.positionLabel, 40)}: จุด #${slot.stopNumber} (${sanitizeDriverField(
            slot.customerName,
            80
          )})`
      )
      .join('\n');

    const safeMapsUrl =
      typeof route.googleMapsUrl === 'string' &&
      route.googleMapsUrl.startsWith('https://www.google.com/maps/')
        ? route.googleMapsUrl
        : '-';

    const message = [
      `🚚 แผนส่งของ GreenRoute AI — ${sanitizeDriverField(route.vehicleName, 40)}`,
      `คลังต้นทาง: ${sanitizeDriverField(activePreset.depot.name, 80)}`,
      `ระยะทางรวม: ${route.distanceKm} กม. | น้ำหนัก: ${route.totalWeightKg}/${route.maxWeightKg} กก. (${route.loadPct}%)`,
      '',
      '📍 ลำดับจุดส่ง:',
      stopsText,
      '',
      '📦 ลำดับยกของขึ้นรถ (LIFO):',
      lifoText,
      '',
      `🗺️ เปิดนำทาง Google Maps:\n${safeMapsUrl}`,
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
        hasApiKey={Boolean(apiKey)}
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
              rawImageDataUrl={imagePrivacy.raw}
              redactedImageDataUrl={imagePrivacy.redacted}
              imageStatus={imagePrivacy.status}
              imageError={imagePrivacy.error}
              onChangeImages={setImagePrivacy}
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
              forceOffline={forceOffline}
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
        imagePrivacy={imagePrivacy}
        telemetry={telemetry}
        optimization={optimization}
      />

      {showSettingsModal && (
        <ApiSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          apiKey={apiKey}
          model={model}
          forceOffline={forceOffline}
          onSave={handleSaveApiSettings}
        />
      )}

      {toastMsg && (
        <div className="toast" role="status" aria-live="polite">
          <CheckCircle2 size={16} color="#6ee7b7" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

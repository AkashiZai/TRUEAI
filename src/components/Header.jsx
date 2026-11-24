import { FileText, KeyRound, ShieldCheck } from 'lucide-react';

export default function Header({
  telemetry,
  hasApiKey,
  forceOffline,
  onOpenReport,
  onOpenGuardrail,
  onOpenSettings,
  canOpenReport,
}) {
  const isLive = telemetry?.mode === 'gemini-live';
  const statusText = isLive
    ? `${telemetry.modelUsed} · Live`
    : forceOffline
      ? 'Offline Smart Fallback · Safe Mode'
      : hasApiKey
        ? 'Offline Smart Fallback · Auto-Failover'
        : 'Offline Smart Fallback · Ready';

  return (
    <header className="topbar">
      <div className="brand-group">
        <div className="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 17C4 11.5 8.5 7 14 7H20M20 7L16.5 3.5M20 7L16.5 10.5"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" />
            <path
              d="M12.5 19.5C15.5 19.5 18.5 17.5 19.5 14C16.2 14 13.8 15.8 12.5 19.5Z"
              fill="currentColor"
              fillOpacity="0.85"
            />
          </svg>
        </div>
        <div className="brand-title-wrap">
          <h1 className="brand-title">
            GreenRoute AI
            <span className="track-tag">Track 4 · SWU</span>
          </h1>
          <span className="brand-subtitle">
            Chat-to-Green-Route · Hybrid Gemini + CVRPTW + TGO Carbon Engine
          </span>
        </div>
      </div>

      <div className="topbar-actions">
        <button
          id="btn-engine-status"
          type="button"
          className={`engine-status ${isLive ? 'is-live' : 'is-fallback'}`}
          onClick={onOpenSettings}
          title="คลิกเพื่อตั้งค่า Gemini API Key หรือสลับโหมด Offline Fallback"
        >
          <span className="status-dot" />
          <span>{statusText}</span>
        </button>

        <button
          id="btn-open-guardrail"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenGuardrail}
        >
          <ShieldCheck size={15} />
          <span>PDPA &amp; Tech Spec</span>
        </button>

        <button
          id="btn-open-report"
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onOpenReport}
          disabled={!canOpenReport}
        >
          <FileText size={15} />
          <span>รายงานคาร์บอน TGO</span>
        </button>

        <button
          id="btn-open-settings"
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onOpenSettings}
          aria-label="ตั้งค่า Gemini API Key"
        >
          <KeyRound size={15} />
          <span>API Key</span>
        </button>
      </div>
    </header>
  );
}

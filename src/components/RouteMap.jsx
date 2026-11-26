import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Layers, Navigation } from 'lucide-react';
import { isValidCoordinate, safeHexColor, sanitizePlainText } from '../engine/securityUtils';

const DEFAULT_BKK_CENTER = [13.7456, 100.5652];

/**
 * Builds a pure DOM node for Leaflet tooltips/popups using strictly .textContent.
 * Zero HTML string interpolation / zero innerHTML -> structurally immune to DOM-based XSS.
 */
function createTooltipNode(titleText, detailText) {
  const wrap = document.createElement('div');
  const titleEl = document.createElement('strong');
  titleEl.textContent = sanitizePlainText(titleText, { maxLen: 100 });
  wrap.appendChild(titleEl);
  wrap.appendChild(document.createElement('br'));
  wrap.appendChild(document.createTextNode(sanitizePlainText(detailText, { maxLen: 140 })));
  return wrap;
}

function createStopPopupNode({
  customerName,
  matchedArea,
  routeLabel,
  routeColor,
  itemsSummary,
  weightKg,
  eta,
  timeWindow,
}) {
  const wrap = document.createElement('div');
  wrap.style.fontFamily = 'IBM Plex Sans Thai, sans-serif';
  wrap.style.fontSize = '12.5px';

  const titleEl = document.createElement('strong');
  titleEl.textContent = sanitizePlainText(customerName, { maxLen: 90, fallback: 'จุดส่งสินค้า' });
  wrap.appendChild(titleEl);
  wrap.appendChild(document.createElement('br'));

  wrap.appendChild(
    document.createTextNode(sanitizePlainText(matchedArea, { maxLen: 100, fallback: '-' }))
  );
  wrap.appendChild(document.createElement('br'));

  const badgeEl = document.createElement('span');
  badgeEl.style.color = safeHexColor(routeColor, '#0f5132');
  badgeEl.style.fontWeight = '700';
  badgeEl.textContent = sanitizePlainText(routeLabel, { maxLen: 80 });
  wrap.appendChild(badgeEl);
  wrap.appendChild(document.createElement('br'));

  if (itemsSummary) {
    wrap.appendChild(document.createTextNode(`สินค้า: ${sanitizePlainText(itemsSummary, { maxLen: 100 })} (`));
    const wEl = document.createElement('b');
    wEl.textContent = `${Number(weightKg) || 0} กก.`;
    wrap.appendChild(wEl);
    wrap.appendChild(document.createTextNode(')'));
    wrap.appendChild(document.createElement('br'));

    wrap.appendChild(document.createTextNode('ETA: '));
    const etaEl = document.createElement('b');
    etaEl.textContent = sanitizePlainText(eta, { maxLen: 16, fallback: '-' });
    wrap.appendChild(etaEl);
    if (timeWindow) {
      wrap.appendChild(document.createTextNode(` (ช่วงเวลา ${sanitizePlainText(timeWindow, { maxLen: 24 })})`));
    }
  } else {
    wrap.appendChild(document.createTextNode('น้ำหนัก: '));
    const wEl = document.createElement('b');
    wEl.textContent = `${Number(weightKg) || 0} กก.`;
    wrap.appendChild(wEl);
    wrap.appendChild(document.createTextNode(` · ETA ${sanitizePlainText(eta, { maxLen: 16, fallback: '-' })}`));
  }

  return wrap;
}

function createDepotPopupNode(depotName) {
  const wrap = document.createElement('div');
  wrap.style.fontFamily = 'IBM Plex Sans Thai, sans-serif';
  wrap.style.fontSize = '12.5px';
  const titleEl = document.createElement('strong');
  titleEl.textContent = 'คลังสินค้าต้นทาง (Depot)';
  wrap.appendChild(titleEl);
  wrap.appendChild(document.createElement('br'));
  wrap.appendChild(document.createTextNode(sanitizePlainText(depotName, { maxLen: 100 })));
  return wrap;
}

function createSafeMarkerIcon(stopNumber, color, size, opacity = 1) {
  const safeNum = String(Math.max(1, Math.min(999, Math.trunc(Number(stopNumber) || 1))));
  const safeCol = safeHexColor(color, '#0f5132');
  const safeOp = opacity === 1 ? '1' : '0.35';
  const el = document.createElement('div');
  el.className = 'gr-marker';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.background = safeCol;
  el.style.opacity = safeOp;
  el.textContent = safeNum;

  return L.divIcon({
    className: '',
    html: el,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function RouteMap({
  depot,
  optimization,
  mapViewMode,
  onChangeMapViewMode,
  selectedVehicleId,
  onSelectVehicle,
  forceOffline = false,
}) {
  const mapElRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapElRef.current || mapInstanceRef.current) return;

    const map = L.map(mapElRef.current, {
      center: DEFAULT_BKK_CENTER,
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Clean OpenStreetMap Bangkok street tiles (OSM Tile Usage Policy requires origin Referer)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
      referrerPolicy: 'strict-origin-when-cross-origin',
    }).addTo(map);

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Re-render routes & markers whenever optimization, viewMode, or selection changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group || !depot || !isValidCoordinate(depot.lat, depot.lng)) return;

    group.clearLayers();
    const boundsPoints = [[depot.lat, depot.lng]];

    const beforeRoutes = optimization?.beforeRoutes || [];
    const afterRoutes = optimization?.afterRoutes || [];

    // 1. Draw BEFORE routes (dashed crimson) if mode is 'before' or 'compare'
    if (mapViewMode === 'before' || mapViewMode === 'compare') {
      const isOverlay = mapViewMode === 'compare';
      beforeRoutes.forEach((route) => {
        if (!route.path?.length) return;
        L.polyline(route.path, {
          color: '#b91c1c',
          weight: isOverlay ? 2.5 : 3.5,
          opacity: isOverlay ? 0.42 : 0.82,
          dashArray: '7, 7',
        })
          .bindTooltip(
            createTooltipNode(
              `ก่อนจัดสาย: ${route.vehicleName}`,
              `ระยะทาง ${route.distanceKm} กม. · ${route.stops.length} จุด`
            ),
            { sticky: true }
          )
          .addTo(group);

        if (!isOverlay) {
          route.stops.forEach((stop) => {
            if (!isValidCoordinate(stop.lat, stop.lng)) return;
            boundsPoints.push([stop.lat, stop.lng]);
            const icon = createSafeMarkerIcon(stop.stopNumber, '#b91c1c', 24, 1);
            L.marker([stop.lat, stop.lng], { icon })
              .bindPopup(
                createStopPopupNode({
                  customerName: stop.customerName,
                  matchedArea: stop.matchedArea,
                  routeLabel: `ก่อนจัดสาย (${route.vehicleName} · จุดที่ ${stop.stopNumber})`,
                  routeColor: '#b91c1c',
                  weightKg: stop.weightKg,
                  eta: stop.eta,
                })
              )
              .addTo(group);
          });
        }
      });
    }

    // 2. Draw AFTER routes (crisp solid pine/cobalt/ochre) if mode is 'after' or 'compare'
    if (mapViewMode === 'after' || mapViewMode === 'compare') {
      afterRoutes.forEach((route) => {
        if (!route.path?.length) return;
        const isDimmed = selectedVehicleId && selectedVehicleId !== route.vehicleId;
        const safeColor = safeHexColor(route.color, '#0f5132');

        const poly = L.polyline(route.path, {
          color: safeColor,
          weight: isDimmed ? 3 : 4.5,
          opacity: isDimmed ? 0.25 : 0.92,
        })
          .bindTooltip(
            createTooltipNode(
              `${route.vehicleName} (AI Optimized)`,
              `ระยะทาง ${route.distanceKm} กม. · บรรทุก ${route.loadPct}% (${route.totalWeightKg} กก.)`
            ),
            { sticky: true }
          )
          .addTo(group);

        poly.on('click', () => {
          onSelectVehicle(selectedVehicleId === route.vehicleId ? null : route.vehicleId);
        });

        route.stops.forEach((stop) => {
          if (!isValidCoordinate(stop.lat, stop.lng)) return;
          boundsPoints.push([stop.lat, stop.lng]);
          const icon = createSafeMarkerIcon(stop.stopNumber, safeColor, 26, isDimmed ? 0.35 : 1);

          L.marker([stop.lat, stop.lng], { icon })
            .bindPopup(
              createStopPopupNode({
                customerName: stop.customerName,
                matchedArea: stop.matchedArea,
                routeLabel: `${route.vehicleName} · ลำดับส่งที่ ${stop.stopNumber}`,
                routeColor: safeColor,
                itemsSummary: stop.itemsSummary,
                weightKg: stop.weightKg,
                eta: stop.eta,
                timeWindow: `${stop.timeStart}–${stop.timeEnd}`,
              })
            )
            .addTo(group);
        });
      });
    }

    // 3. Draw Depot Marker on top (pure DOM element, zero innerHTML)
    const depotEl = document.createElement('div');
    depotEl.className = 'gr-depot-marker';
    depotEl.textContent = 'คลังต้นทาง';
    const depotIcon = L.divIcon({
      className: '',
      html: depotEl,
      iconSize: [86, 26],
      iconAnchor: [43, 13],
    });
    L.marker([depot.lat, depot.lng], { icon: depotIcon, zIndexOffset: 500 })
      .bindPopup(createDepotPopupNode(depot.name))
      .addTo(group);

    if (boundsPoints.length > 1) {
      map.fitBounds(L.latLngBounds(boundsPoints), { padding: [38, 38], maxZoom: 13 });
    } else {
      map.setView([depot.lat, depot.lng], 12);
    }
  }, [depot, optimization, mapViewMode, selectedVehicleId, onSelectVehicle]);

  const afterRoutes = optimization?.afterRoutes || [];
  const benchmark = optimization?.benchmark;

  return (
    <section className="panel" aria-label="แผนที่เส้นทางขนส่งกรุงเทพฯ">
      <div className="map-toolbar">
        <div className="panel-title-group">
          <Navigation size={16} color="var(--pine-800)" />
          <div>
            <h2 className="panel-title">แผนที่เปรียบเทียบเส้นทางจริง (Before vs After)</h2>
            <p className="panel-subtitle">
              คลิกที่เส้นทางหรือการ์ดรถด้านล่างเพื่อโฟกัสแต่ละคัน · {depot.name}
            </p>
          </div>
        </div>

        <div className="segmented" role="tablist" aria-label="มุมมองแผนที่">
          <button
            id="map-mode-after"
            type="button"
            role="tab"
            aria-selected={mapViewMode === 'after'}
            className={`segmented-btn ${mapViewMode === 'after' ? 'is-active' : ''}`}
            onClick={() => onChangeMapViewMode('after')}
          >
            หลังจัดสาย (AI)
          </button>
          <button
            id="map-mode-before"
            type="button"
            role="tab"
            aria-selected={mapViewMode === 'before'}
            className={`segmented-btn ${mapViewMode === 'before' ? 'is-active' : ''}`}
            onClick={() => onChangeMapViewMode('before')}
          >
            ก่อนจัดสาย (เดิม)
          </button>
          <button
            id="map-mode-compare"
            type="button"
            role="tab"
            aria-selected={mapViewMode === 'compare'}
            className={`segmented-btn ${mapViewMode === 'compare' ? 'is-active' : ''}`}
            onClick={() => onChangeMapViewMode('compare')}
          >
            <Layers size={13} />
            <span>ซ้อนทับเทียบ</span>
          </button>
        </div>
      </div>

      <div className="map-container-wrap">
        <div ref={mapElRef} className="leaflet-map-host" />

        <div className="map-legend">
          {(mapViewMode === 'after' || mapViewMode === 'compare') &&
            afterRoutes.map((r) => (
              <span key={r.vehicleId} className="legend-item">
                <span className="legend-swatch" style={{ background: safeHexColor(r.color) }} />
                <span>
                  {r.vehicleName} ({r.distanceKm} กม.)
                </span>
              </span>
            ))}
          {(mapViewMode === 'before' || mapViewMode === 'compare') && (
            <span className="legend-item">
              <span className="legend-swatch dashed" />
              <span>เส้นทางเดิมแบบจัดมือ ({optimization?.summary?.beforeDistanceKm} กม.)</span>
            </span>
          )}
        </div>
      </div>

      <div className="map-meta-bar">
        <span className="mono">
          Solver: {benchmark ? `${benchmark.solveTimeMs} ms (${benchmark.iterations} evals)` : '-'}
        </span>
        <span>
          ถนนอ้างอิง:{' '}
          <strong>
            {forceOffline
              ? 'Local Road-Adjusted (×1.32 · OSRM Disabled in Offline Safe Mode)'
              : optimization?.osrmActive
                ? 'OSRM Live Bangkok Street Network'
                : 'Road-Adjusted Network (×1.32 Offline Safe)'}
          </strong>
        </span>
      </div>
    </section>
  );
}

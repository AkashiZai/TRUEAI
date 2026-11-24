import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Layers, Navigation } from 'lucide-react';

const DEFAULT_BKK_CENTER = [13.7456, 100.5652];

export default function RouteMap({
  depot,
  optimization,
  mapViewMode,
  onChangeMapViewMode,
  selectedVehicleId,
  onSelectVehicle,
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

    // Clean OpenStreetMap Bangkok street tiles (zero API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
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
    if (!map || !group || !depot) return;

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
            `<strong>ก่อนจัดสาย: ${route.vehicleName}</strong><br/>ระยะทาง ${route.distanceKm} กม. · ${route.stops.length} จุด`,
            { sticky: true }
          )
          .addTo(group);

        if (!isOverlay) {
          route.stops.forEach((stop) => {
            boundsPoints.push([stop.lat, stop.lng]);
            const icon = L.divIcon({
              className: '',
              html: `<div class="gr-marker" style="width:24px;height:24px;background:#b91c1c">${stop.stopNumber}</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
            });
            L.marker([stop.lat, stop.lng], { icon })
              .bindPopup(
                `<div style="font-family:IBM Plex Sans Thai,sans-serif;font-size:12.5px">
                  <strong>${stop.customerName}</strong><br/>
                  ${stop.matchedArea}<br/>
                  <span style="color:#b91c1c">ก่อนจัดสาย (${route.vehicleName} · จุดที่ ${stop.stopNumber})</span><br/>
                  น้ำหนัก: <b>${stop.weightKg} กก.</b> · ETA ${stop.eta}
                </div>`
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

        const poly = L.polyline(route.path, {
          color: route.color,
          weight: isDimmed ? 3 : 4.5,
          opacity: isDimmed ? 0.25 : 0.92,
        })
          .bindTooltip(
            `<strong>${route.vehicleName} (AI Optimized)</strong><br/>ระยะทาง ${route.distanceKm} กม. · บรรทุก ${route.loadPct}% (${route.totalWeightKg} กก.)`,
            { sticky: true }
          )
          .addTo(group);

        poly.on('click', () => {
          onSelectVehicle(selectedVehicleId === route.vehicleId ? null : route.vehicleId);
        });

        route.stops.forEach((stop) => {
          boundsPoints.push([stop.lat, stop.lng]);
          const icon = L.divIcon({
            className: '',
            html: `<div class="gr-marker" style="width:26px;height:26px;background:${route.color};opacity:${
              isDimmed ? 0.35 : 1
            }">${stop.stopNumber}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });

          L.marker([stop.lat, stop.lng], { icon })
            .bindPopup(
              `<div style="font-family:IBM Plex Sans Thai,sans-serif;font-size:12.5px">
                <strong>${stop.customerName}</strong><br/>
                ${stop.matchedArea}<br/>
                <span style="color:${route.color};font-weight:700">${route.vehicleName} · ลำดับส่งที่ ${stop.stopNumber}</span><br/>
                สินค้า: ${stop.itemsSummary} (<b>${stop.weightKg} กก.</b>)<br/>
                ETA: <b>${stop.eta}</b> (ช่วงเวลา ${stop.timeStart}–${stop.timeEnd})
              </div>`
            )
            .addTo(group);
        });
      });
    }

    // 3. Draw Depot Marker on top
    const depotIcon = L.divIcon({
      className: '',
      html: `<div class="gr-depot-marker">คลังต้นทาง</div>`,
      iconSize: [86, 26],
      iconAnchor: [43, 13],
    });
    L.marker([depot.lat, depot.lng], { icon: depotIcon, zIndexOffset: 500 })
      .bindPopup(
        `<div style="font-family:IBM Plex Sans Thai,sans-serif;font-size:12.5px">
          <strong>คลังสินค้าต้นทาง (Depot)</strong><br/>${depot.name}
        </div>`
      )
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
                <span className="legend-swatch" style={{ background: r.color }} />
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
            {optimization?.osrmActive
              ? 'OSRM Live Bangkok Street Network'
              : 'Road-Adjusted Network (×1.32 Offline Safe)'}
          </strong>
        </span>
      </div>
    </section>
  );
}

/**
 * Hardened Pure Computer Science CVRPTW (Capacitated Vehicle Routing Problem with Time Windows)
 * & Load Consolidation Solver + Baseline FIFO Simulator + Bounded OSRM Road Enricher
 *
 * Security invariants enforced:
 * 1. Finite bounded numeric constraints & coordinate checks (zero NaN/Infinity/negative loadPct).
 * 2. Bounded order count (<=100), O(1) Clarke-Wright route map, & capped 2-Opt/Relocate loops
 *    -> Eliminates Theta(N^3) main-thread DoS freezes.
 * 3. Strict Offline Safe Mode enforcement: zero external OSRM requests when `forceOffline === true`.
 * 4. Bounded OSRM concurrency (<=4), stop-count cap, & strict sanity bounds on returned distance/geometry.
 * 5. Safe Google Maps URL construction via URL/URLSearchParams with validated finite coordinates.
 */

import { clampFinite, isValidCoordinate, MAX_ORDERS_PER_BATCH } from './securityUtils.js';

const BANGKOK_ROAD_CIRCUITY = 1.32;
const AVG_URBAN_SPEED_KMH = 24;
const SERVICE_TIME_MIN = 10;
const ROUTE_COLORS = ['#0f5132', '#1e40af', '#b45309', '#0e7490', '#6d28d9'];
const MAX_TWO_OPT_PASSES = 20;
const MAX_TWO_OPT_ITERS = 8000;
const MAX_RELOCATE_ITERS = 10000;
const MAX_OSRM_STOPS_PER_ROUTE = 25;
const MAX_OSRM_TOTAL_ROUTES = 10;
const MAX_OSRM_CONCURRENCY = 4;
const MAX_OSRM_GEOMETRY_POINTS = 2500;
const MAX_GMAPS_WAYPOINTS = 9;

export function haversineKm(a, b) {
  if (!a || !b || !isValidCoordinate(a.lat, a.lng) || !isValidCoordinate(b.lat, b.lng)) {
    return 0;
  }
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const rawH = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  // Clamp to [0, 1] to avoid floating-point overshoot causing Math.asin(NaN)
  const h = Math.min(1, Math.max(0, rawH));
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function roadDistanceKm(a, b) {
  return haversineKm(a, b) * BANGKOK_ROAD_CIRCUITY;
}

export function timeToMin(hhmm = '08:00') {
  if (typeof hhmm === 'string') {
    const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
        return h * 60 + min;
      }
    }
  }
  return 8 * 60;
}

export function minToTime(totalMin) {
  const safe = Number.isFinite(totalMin) ? totalMin : 8 * 60;
  const clamped = Math.max(0, Math.round(safe));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function calcRouteDistance(stops, depot) {
  if (!stops || stops.length === 0) return 0;
  let dist = roadDistanceKm(depot, stops[0]);
  for (let i = 0; i < stops.length - 1; i++) {
    dist += roadDistanceKm(stops[i], stops[i + 1]);
  }
  dist += roadDistanceKm(stops[stops.length - 1], depot);
  return dist;
}

function calcRouteWeight(stops) {
  return stops.reduce((sum, s) => sum + clampFinite(s?.weightKg, 5, 5000, 150), 0);
}

function sanitizeOrdersAndFleet(rawOrders, rawDepot, rawFleetConfig) {
  const depot = {
    name: typeof rawDepot?.name === 'string' ? rawDepot.name : 'คลังสินค้าต้นทาง',
    lat: isValidCoordinate(rawDepot?.lat, rawDepot?.lng) ? rawDepot.lat : 13.7456,
    lng: isValidCoordinate(rawDepot?.lat, rawDepot?.lng) ? rawDepot.lng : 100.5652,
  };

  const fleetConfig = {
    truckCount: Math.round(clampFinite(rawFleetConfig?.truckCount, 1, 50, 3)),
    maxWeightKg: Math.round(clampFinite(rawFleetConfig?.maxWeightKg, 200, 20000, 1000)),
  };

  const seenIds = new Set();
  const orders = (Array.isArray(rawOrders) ? rawOrders : [])
    .slice(0, MAX_ORDERS_PER_BATCH)
    .filter((o) => o && typeof o === 'object')
    .map((o, idx) => {
      let id = typeof o.id === 'string' && o.id ? o.id : `ord-safe-${idx + 1}`;
      if (seenIds.has(id)) id = `${id}-${idx + 1}`;
      seenIds.add(id);

      const lat = isValidCoordinate(o.lat, o.lng) ? o.lat : depot.lat;
      const lng = isValidCoordinate(o.lat, o.lng) ? o.lng : depot.lng;

      return {
        ...o,
        id,
        lat,
        lng,
        weightKg: Math.round(clampFinite(o.weightKg, 5, 5000, 150)),
      };
    });

  return { orders, depot, fleetConfig };
}

/**
 * Simulates schedule timeline & checks Time Window feasibility for a route.
 */
function evaluateRouteSchedule(stops, depot, departMin = 7 * 60 + 30) {
  let currentMin = departMin;
  let prev = depot;
  let lateCount = 0;
  const schedule = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const legKm = roadDistanceKm(prev, stop);
    const travelMin = (legKm / AVG_URBAN_SPEED_KMH) * 60;
    const rawArrival = currentMin + travelMin;
    const twStart = timeToMin(stop.timeStart);
    const twEndRaw = timeToMin(stop.timeEnd);
    const twEnd = twEndRaw >= twStart ? twEndRaw : twStart + 120;

    const startService = Math.max(rawArrival, twStart);
    const isLate = rawArrival > twEnd + 5;
    if (isLate) lateCount++;

    schedule.push({
      ...stop,
      stopNumber: i + 1,
      legKm: Math.round(legKm * 10) / 10,
      eta: minToTime(startService),
      isLate,
    });

    currentMin = startService + SERVICE_TIME_MIN;
    prev = stop;
  }

  const returnKm = stops.length > 0 ? roadDistanceKm(prev, depot) : 0;
  const returnMin = currentMin + (returnKm / AVG_URBAN_SPEED_KMH) * 60;

  return {
    schedule,
    lateCount,
    departTime: minToTime(departMin),
    returnTime: minToTime(returnMin),
    durationMin: Math.max(0, Math.round(returnMin - departMin)),
  };
}

/**
 * 1) BEFORE BASELINE: Naive Manual SME Dispatch (FIFO arrival order across available fleet)
 */
function buildBaselineFIFO(orders, depot, fleetConfig) {
  const { truckCount, maxWeightKg } = fleetConfig;
  if (!orders.length) return [];
  const targetTrucks = Math.max(1, Math.min(truckCount, orders.length));
  const buckets = Array.from({ length: targetTrucks }, () => []);

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const preferredIdx = i % targetTrucks;

    if (calcRouteWeight(buckets[preferredIdx]) + order.weightKg <= maxWeightKg) {
      buckets[preferredIdx].push(order);
    } else {
      const fitIdx = buckets.findIndex(
        (b) => calcRouteWeight(b) + order.weightKg <= maxWeightKg
      );
      if (fitIdx !== -1) {
        buckets[fitIdx].push(order);
      } else {
        buckets.push([order]);
      }
    }
  }

  return buckets
    .filter((b) => b.length > 0)
    .map((stops, idx) => finalizeVehicleRoute(stops, depot, idx, maxWeightKg, true));
}

/**
 * 2) AFTER OPTIMIZED: Clarke-Wright Savings (O(N^2) with route Map) + Time-Window + Bounded 2-Opt + Relocate
 */
function solveCVRPTW(orders, depot, fleetConfig) {
  const { maxWeightKg } = fleetConfig;
  if (!orders.length) return { routes: [], iterations: 0 };

  let iterations = 0;

  // Step A: Initialize each order as its own route with O(1) membership & weight tracking
  const routeMap = new Map();
  const orderToRouteId = new Map();
  orders.forEach((order, idx) => {
    routeMap.set(idx, { stops: [order], weight: order.weightKg });
    orderToRouteId.set(order.id, idx);
  });

  // Step B: Compute Clarke-Wright Savings pairs with Time-Window affinity
  const savings = [];
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = orders[i];
      const b = orders[j];
      const distSaving =
        roadDistanceKm(depot, a) + roadDistanceKm(depot, b) - roadDistanceKm(a, b);

      const midA = (timeToMin(a.timeStart) + timeToMin(a.timeEnd)) / 2;
      const midB = (timeToMin(b.timeStart) + timeToMin(b.timeEnd)) / 2;
      const twGapHours = Math.abs(midA - midB) / 60;
      const score = distSaving - twGapHours * 1.1;

      savings.push({ idA: a.id, idB: b.id, score });
    }
  }
  savings.sort((x, y) => y.score - x.score);

  // Step C: O(1) lookup greedy route merges (eliminates Theta(N^3) array scanning)
  for (const pair of savings) {
    iterations++;
    const rIdA = orderToRouteId.get(pair.idA);
    const rIdB = orderToRouteId.get(pair.idB);
    if (rIdA === undefined || rIdB === undefined || rIdA === rIdB) continue;

    const entryA = routeMap.get(rIdA);
    const entryB = routeMap.get(rIdB);
    if (!entryA || !entryB) continue;

    if (entryA.weight + entryB.weight > maxWeightKg) continue;

    const routeA = entryA.stops;
    const routeB = entryB.stops;
    const aIsStart = routeA[0].id === pair.idA;
    const aIsEnd = routeA[routeA.length - 1].id === pair.idA;
    const bIsStart = routeB[0].id === pair.idB;
    const bIsEnd = routeB[routeB.length - 1].id === pair.idB;

    if ((!aIsStart && !aIsEnd) || (!bIsStart && !bIsEnd)) continue;

    let merged = null;
    if (aIsEnd && bIsStart) merged = [...routeA, ...routeB];
    else if (bIsEnd && aIsStart) merged = [...routeB, ...routeA];
    else if (aIsEnd && bIsEnd) merged = [...routeA, ...[...routeB].reverse()];
    else if (aIsStart && bIsStart) merged = [...[...routeA].reverse(), ...routeB];

    if (merged) {
      const fwd = evaluateRouteSchedule(merged, depot);
      const revList = [...merged].reverse();
      const rev = evaluateRouteSchedule(revList, depot);
      const bestDir = rev.lateCount < fwd.lateCount ? revList : merged;

      const keepId = Math.min(rIdA, rIdB);
      const dropId = Math.max(rIdA, rIdB);
      routeMap.set(keepId, { stops: bestDir, weight: entryA.weight + entryB.weight });
      routeMap.delete(dropId);
      for (const stop of bestDir) {
        orderToRouteId.set(stop.id, keepId);
      }
    }
  }

  let routes = Array.from(routeMap.values(), (entry) => entry.stops);

  // Step D: Bin-Packing Consolidation Pass (eliminate underutilized trucks)
  let consolidated = true;
  let consolidateGuard = 0;
  while (consolidated && routes.length > 1 && consolidateGuard < MAX_ORDERS_PER_BATCH) {
    consolidated = false;
    consolidateGuard++;
    routes.sort((a, b) => calcRouteWeight(a) - calcRouteWeight(b));
    outer: for (let i = 0; i < routes.length; i++) {
      for (let j = routes.length - 1; j > i; j--) {
        if (calcRouteWeight(routes[i]) + calcRouteWeight(routes[j]) <= maxWeightKg) {
          const combined = nearestNeighborOrder([...routes[j], ...routes[i]], depot);
          routes[j] = combined;
          routes.splice(i, 1);
          consolidated = true;
          iterations++;
          break outer;
        }
      }
    }
  }

  // Step E: Bounded Intra-Route 2-Opt Local Search
  routes = routes.map((route) => {
    const res = twoOptImprove(route, depot);
    iterations += res.iters;
    return res.route;
  });

  // Step F: Bounded Inter-Route 1-0 Relocate Local Search
  let improved = true;
  let relocatePasses = 0;
  let relocateIters = 0;
  while (improved && relocatePasses < 25 && relocateIters < MAX_RELOCATE_ITERS) {
    improved = false;
    relocatePasses++;

    for (let a = 0; a < routes.length && relocateIters < MAX_RELOCATE_ITERS; a++) {
      if (routes[a].length <= 1) continue;
      for (let i = 0; i < routes[a].length && relocateIters < MAX_RELOCATE_ITERS; i++) {
        const stop = routes[a][i];
        const currDistA = calcRouteDistance(routes[a], depot);

        for (let b = 0; b < routes.length && relocateIters < MAX_RELOCATE_ITERS; b++) {
          if (a === b) continue;
          if (calcRouteWeight(routes[b]) + stop.weightKg > maxWeightKg) continue;

          const currDistB = calcRouteDistance(routes[b], depot);
          const candA = routes[a].filter((_, idx) => idx !== i);
          const newDistA = calcRouteDistance(candA, depot);

          let bestPos = -1;
          let bestGain = 0.2;
          for (let pos = 0; pos <= routes[b].length; pos++) {
            iterations++;
            relocateIters++;
            const candB = [...routes[b].slice(0, pos), stop, ...routes[b].slice(pos)];
            const newDistB = calcRouteDistance(candB, depot);
            const gain = currDistA + currDistB - (newDistA + newDistB);
            if (gain > bestGain) {
              bestGain = gain;
              bestPos = pos;
            }
            if (relocateIters >= MAX_RELOCATE_ITERS) break;
          }

          if (bestPos !== -1) {
            routes[a] = candA;
            routes[b] = [...routes[b].slice(0, bestPos), stop, ...routes[b].slice(bestPos)];
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  // Final 2-Opt polish + Time-window orientation check
  routes = routes
    .filter((r) => r.length > 0)
    .map((route) => {
      const polished = twoOptImprove(route, depot).route;
      const fwd = evaluateRouteSchedule(polished, depot);
      const revList = [...polished].reverse();
      const rev = evaluateRouteSchedule(revList, depot);
      return rev.lateCount < fwd.lateCount ? revList : polished;
    });

  return {
    routes: routes.map((stops, idx) => finalizeVehicleRoute(stops, depot, idx, maxWeightKg, false)),
    iterations,
  };
}

function nearestNeighborOrder(stops, depot) {
  const remaining = [...stops];
  const ordered = [];
  let curr = depot;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = roadDistanceKm(curr, remaining[i]);
      const twBias = ((timeToMin(remaining[i].timeEnd) - 480) / 60) * 0.45;
      const score = dist + twBias;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curr = next;
  }
  return ordered;
}

function twoOptImprove(route, depot) {
  if (route.length < 3) return { route, iters: 1 };
  let best = [...route];
  let bestDist = calcRouteDistance(best, depot);
  let iters = 0;
  let passes = 0;
  let improved = true;

  while (improved && passes < MAX_TWO_OPT_PASSES && iters < MAX_TWO_OPT_ITERS) {
    improved = false;
    passes++;
    for (let i = 0; i < best.length - 1 && iters < MAX_TWO_OPT_ITERS; i++) {
      for (let k = i + 1; k < best.length && iters < MAX_TWO_OPT_ITERS; k++) {
        iters++;
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const candDist = calcRouteDistance(candidate, depot);
        if (candDist + 0.05 < bestDist) {
          best = candidate;
          bestDist = candDist;
          improved = true;
        }
      }
    }
  }
  return { route: best, iters };
}

function buildSafeGoogleMapsUrl(depot, schedule) {
  const url = new URL('https://www.google.com/maps/dir/');
  const originCoord = `${depot.lat.toFixed(6)},${depot.lng.toFixed(6)}`;
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', originCoord);
  url.searchParams.set('destination', originCoord);
  const waypoints = schedule
    .slice(0, MAX_GMAPS_WAYPOINTS)
    .filter((s) => isValidCoordinate(s.lat, s.lng))
    .map((s) => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`)
    .join('|');
  if (waypoints) {
    url.searchParams.set('waypoints', waypoints);
  }
  url.searchParams.set('travelmode', 'driving');
  return url.toString();
}

function finalizeVehicleRoute(stops, depot, idx, maxWeightKg, isBaseline) {
  const safeMaxWeight = Math.max(200, maxWeightKg);
  const totalWeightKg = calcRouteWeight(stops);
  const distanceKm = Math.round(calcRouteDistance(stops, depot) * 100) / 100;
  const loadPct = clampFinite(
    Math.round((totalWeightKg / safeMaxWeight) * 1000) / 10,
    0,
    100,
    0
  );
  const { schedule, lateCount, departTime, returnTime, durationMin } = evaluateRouteSchedule(
    stops,
    depot,
    7 * 60 + 30
  );

  const lifoOrder = [...schedule].reverse().map((stop, loadIdx) => ({
    loadRank: loadIdx + 1,
    stopNumber: stop.stopNumber,
    customerName: stop.customerName,
    weightKg: stop.weightKg,
    positionLabel:
      loadIdx === 0
        ? 'ในสุด (ชิดหัวเก๋ง)'
        : loadIdx === schedule.length - 1
          ? 'ท้ายสุด (หยิบส่งก่อน)'
          : `ชั้นที่ ${loadIdx + 1}`,
  }));

  const fallbackPath = [
    [depot.lat, depot.lng],
    ...schedule.map((s) => [s.lat, s.lng]),
    [depot.lat, depot.lng],
  ];

  const googleMapsUrl = buildSafeGoogleMapsUrl(depot, schedule);

  return {
    vehicleId: isBaseline ? `before-truck-${idx + 1}` : `truck-${idx + 1}`,
    vehicleName: `รถคันที่ ${idx + 1}`,
    color: isBaseline ? '#b91c1c' : ROUTE_COLORS[idx % ROUTE_COLORS.length],
    stops: schedule,
    lifoOrder,
    totalWeightKg,
    maxWeightKg: safeMaxWeight,
    loadPct,
    distanceKm,
    lateCount,
    departTime,
    returnTime,
    durationMin,
    path: fallbackPath,
    roadGeometrySource: 'Road-Adjusted Haversine (×1.32)',
    googleMapsUrl,
  };
}

/**
 * Full Fleet Optimization Runner: returns both Before (Baseline) and After (AI CVRPTW) plans.
 */
export function runFleetOptimization(rawOrders, rawDepot, rawFleetConfig) {
  const t0 = performance.now();
  const { orders, depot, fleetConfig } = sanitizeOrdersAndFleet(
    rawOrders,
    rawDepot,
    rawFleetConfig
  );

  const beforeRoutes = buildBaselineFIFO(orders, depot, fleetConfig);
  const { routes: afterRoutes, iterations } = solveCVRPTW(orders, depot, fleetConfig);

  const beforeDistanceKm = beforeRoutes.reduce((s, r) => s + r.distanceKm, 0);
  const afterDistanceKm = afterRoutes.reduce((s, r) => s + r.distanceKm, 0);

  const beforeAvgLoadPct =
    beforeRoutes.length > 0
      ? beforeRoutes.reduce((s, r) => s + r.loadPct, 0) / beforeRoutes.length
      : 0;
  const afterAvgLoadPct =
    afterRoutes.length > 0
      ? afterRoutes.reduce((s, r) => s + r.loadPct, 0) / afterRoutes.length
      : 0;

  return {
    beforeRoutes,
    afterRoutes,
    summary: {
      beforeDistanceKm: Math.round(beforeDistanceKm * 100) / 100,
      afterDistanceKm: Math.round(afterDistanceKm * 100) / 100,
      beforeTrucksUsed: beforeRoutes.length,
      afterTrucksUsed: afterRoutes.length,
      beforeAvgLoadPct: Math.round(beforeAvgLoadPct * 10) / 10,
      afterAvgLoadPct: Math.round(afterAvgLoadPct * 10) / 10,
      beforeLateStops: beforeRoutes.reduce((s, r) => s + r.lateCount, 0),
      afterLateStops: afterRoutes.reduce((s, r) => s + r.lateCount, 0),
    },
    benchmark: {
      solveTimeMs: Math.max(1, Math.round((performance.now() - t0) * 10) / 10),
      iterations,
      algorithm: 'Clarke-Wright Savings + Time-Window + 2-Opt + 1-0 Relocate',
    },
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length).fill(null);
  let nextIdx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Optional Live Road Geometry Enrichment via OSRM public driving server.
 * Security controls:
 * - Strictly skipped when `forceOffline === true` (zero external coordinate leakage).
 * - Caps route count, stop count, concurrency, geometry point count, and sanity-checks returned distance.
 */
export async function enrichWithOSRMRoads(result, depot, { forceOffline = false } = {}) {
  if (forceOffline || !result || !depot || !isValidCoordinate(depot.lat, depot.lng)) {
    return { ...result, osrmActive: false };
  }

  const allRoutes = [...(result.beforeRoutes || []), ...(result.afterRoutes || [])];
  if (allRoutes.length === 0 || allRoutes.length > MAX_OSRM_TOTAL_ROUTES) {
    return { ...result, osrmActive: false };
  }

  const fetchOneRoute = async (route) => {
    if (!route?.stops?.length || route.stops.length > MAX_OSRM_STOPS_PER_ROUTE) {
      return null;
    }
    if (!route.stops.every((s) => isValidCoordinate(s.lat, s.lng))) {
      return null;
    }

    const pts = [
      [depot.lng, depot.lat],
      ...route.stops.map((s) => [s.lng, s.lat]),
      [depot.lng, depot.lat],
    ];
    const coordStr = pts.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, { signal: controller.signal, referrerPolicy: 'no-referrer' });
      if (!res.ok) return null;
      const json = await res.json();
      const osrmRoute = json?.routes?.[0];
      const rawCoords = osrmRoute?.geometry?.coordinates;
      const rawMeters = Number(osrmRoute?.distance);

      if (!Array.isArray(rawCoords) || rawCoords.length < 2 || rawCoords.length > MAX_OSRM_GEOMETRY_POINTS) {
        return null;
      }
      if (!Number.isFinite(rawMeters) || rawMeters <= 0) {
        return null;
      }

      const distanceKm = Math.round((rawMeters / 1000) * 100) / 100;
      // Sanity-bound returned OSRM distance against Haversine baseline (prevents poisoned ESG figures)
      const baselineKm = Math.max(0.5, route.distanceKm || 1);
      if (distanceKm < baselineKm * 0.35 || distanceKm > baselineKm * 4.5) {
        return null;
      }

      const path = [];
      for (const pair of rawCoords) {
        if (!Array.isArray(pair) || pair.length < 2) return null;
        const lng = Number(pair[0]);
        const lat = Number(pair[1]);
        if (!isValidCoordinate(lat, lng)) return null;
        path.push([lat, lng]);
      }

      return { path, distanceKm };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const beforeCount = result.beforeRoutes.length;
    const fetched = await runWithConcurrency(allRoutes, MAX_OSRM_CONCURRENCY, fetchOneRoute);
    const beforeGeo = fetched.slice(0, beforeCount);
    const afterGeo = fetched.slice(beforeCount);

    const allSucceeded = beforeGeo.every(Boolean) && afterGeo.every(Boolean);

    const nextBefore = result.beforeRoutes.map((r, i) =>
      beforeGeo[i]
        ? {
            ...r,
            path: beforeGeo[i].path,
            distanceKm: allSucceeded ? beforeGeo[i].distanceKm : r.distanceKm,
            roadGeometrySource: 'OSRM Live Bangkok Street Network',
          }
        : r
    );

    const nextAfter = result.afterRoutes.map((r, i) =>
      afterGeo[i]
        ? {
            ...r,
            path: afterGeo[i].path,
            distanceKm: allSucceeded ? afterGeo[i].distanceKm : r.distanceKm,
            roadGeometrySource: 'OSRM Live Bangkok Street Network',
          }
        : r
    );

    const beforeDistanceKm = nextBefore.reduce((s, r) => s + r.distanceKm, 0);
    const afterDistanceKm = nextAfter.reduce((s, r) => s + r.distanceKm, 0);

    return {
      ...result,
      beforeRoutes: nextBefore,
      afterRoutes: nextAfter,
      summary: {
        ...result.summary,
        beforeDistanceKm: Math.round(beforeDistanceKm * 100) / 100,
        afterDistanceKm: Math.round(afterDistanceKm * 100) / 100,
      },
      osrmActive: allSucceeded,
    };
  } catch {
    return { ...result, osrmActive: false };
  }
}

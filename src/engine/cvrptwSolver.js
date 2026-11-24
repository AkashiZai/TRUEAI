/**
 * Pure Computer Science CVRPTW (Capacitated Vehicle Routing Problem with Time Windows)
 * & Load Consolidation Solver + Baseline FIFO Simulator + OSRM Road Geometry Enricher
 *
 * Algorithms used:
 * 1) Baseline (Before): Naive FIFO arrival-order dispatcher split across fleet (how SMEs assign manually)
 * 2) Optimized (After):
 *    - Clarke-Wright Savings with Time-Window compatibility weighting (minimizes fleet count & empty miles)
 *    - Intra-Route 2-Opt Local Search (eliminates crossings, minimizes distance)
 *    - Inter-Route 1-0 Relocate Local Search (balances & tightens loops)
 *    - LIFO Cargo Loading Sequence (Stop #N inside -> Stop #1 at tailgate)
 */

const BANGKOK_ROAD_CIRCUITY = 1.32; // Empirical urban Bangkok road-to-straight-line ratio
const AVG_URBAN_SPEED_KMH = 24; // Realistic Bangkok commercial truck speed (km/h)
const SERVICE_TIME_MIN = 10; // Average unloading time per stop (minutes)
const ROUTE_COLORS = ['#0f5132', '#1e40af', '#b45309', '#0e7490', '#6d28d9'];

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function roadDistanceKm(a, b) {
  return haversineKm(a, b) * BANGKOK_ROAD_CIRCUITY;
}

export function timeToMin(hhmm = '08:00') {
  const [h, m] = String(hhmm).split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

export function minToTime(totalMin) {
  const clamped = Math.max(0, Math.round(totalMin));
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
  return stops.reduce((sum, s) => sum + (Number(s.weightKg) || 0), 0);
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
    const twEnd = timeToMin(stop.timeEnd);

    const startService = Math.max(rawArrival, twStart);
    const isLate = rawArrival > twEnd + 5; // 5 min grace
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
    durationMin: Math.round(returnMin - departMin),
  };
}

/**
 * 1) BEFORE BASELINE: Naive Manual SME Dispatch (FIFO arrival order across available fleet)
 * Models how an admin reads down the LINE chat and hands stops to drivers sequentially
 * without geographic clustering or capacity consolidation.
 */
function buildBaselineFIFO(orders, depot, fleetConfig) {
  const { truckCount = 3, maxWeightKg = 1000 } = fleetConfig;
  const targetTrucks = Math.max(1, Math.min(truckCount, orders.length));

  // Distribute orders in raw LINE arrival order across the available trucks (round-robin with capacity guard)
  const buckets = Array.from({ length: targetTrucks }, () => []);

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const preferredIdx = i % targetTrucks;

    if (calcRouteWeight(buckets[preferredIdx]) + order.weightKg <= maxWeightKg) {
      buckets[preferredIdx].push(order);
    } else {
      // Find any truck with room, or open overflow truck
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
 * 2) AFTER OPTIMIZED: Clarke-Wright Savings + Time-Window + 2-Opt + Inter-Route Relocate
 */
function solveCVRPTW(orders, depot, fleetConfig) {
  const { maxWeightKg = 1000 } = fleetConfig;
  if (!orders.length) return { routes: [], iterations: 0 };

  let iterations = 0;

  // Step A: Initialize each order as its own route
  let routes = orders.map((order) => [order]);

  // Step B: Compute Clarke-Wright Savings pairs with Time-Window affinity
  const savings = [];
  for (let i = 0; i < orders.length; i++) {
    for (let j = i + 1; j < orders.length; j++) {
      const a = orders[i];
      const b = orders[j];
      const distSaving =
        roadDistanceKm(depot, a) + roadDistanceKm(depot, b) - roadDistanceKm(a, b);

      // Mild time-window compatibility bonus (keeps morning jobs grouped with morning jobs)
      const midA = (timeToMin(a.timeStart) + timeToMin(a.timeEnd)) / 2;
      const midB = (timeToMin(b.timeStart) + timeToMin(b.timeEnd)) / 2;
      const twGapHours = Math.abs(midA - midB) / 60;
      const score = distSaving - twGapHours * 1.1;

      savings.push({ idA: a.id, idB: b.id, score });
    }
  }
  savings.sort((x, y) => y.score - x.score);

  // Step C: Merge routes greedily while respecting capacity
  for (const pair of savings) {
    iterations++;
    const rIdxA = routes.findIndex((r) => r.some((o) => o.id === pair.idA));
    const rIdxB = routes.findIndex((r) => r.some((o) => o.id === pair.idB));
    if (rIdxA === -1 || rIdxB === -1 || rIdxA === rIdxB) continue;

    const routeA = routes[rIdxA];
    const routeB = routes[rIdxB];

    // Check capacity constraint
    if (calcRouteWeight(routeA) + calcRouteWeight(routeB) > maxWeightKg) continue;

    // Only merge at route endpoints (classic Clarke-Wright)
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
      // Orient direction for better Time-Window flow
      const fwd = evaluateRouteSchedule(merged, depot);
      const revList = [...merged].reverse();
      const rev = evaluateRouteSchedule(revList, depot);
      const bestDir = rev.lateCount < fwd.lateCount ? revList : merged;

      const keepIdx = Math.min(rIdxA, rIdxB);
      const dropIdx = Math.max(rIdxA, rIdxB);
      routes[keepIdx] = bestDir;
      routes.splice(dropIdx, 1);
    }
  }

  // Step D: Bin-Packing Consolidation Pass (if two small routes can merge to eliminate a truck)
  let consolidated = true;
  while (consolidated && routes.length > 1) {
    consolidated = false;
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

  // Step E: Intra-Route 2-Opt Local Search (untangle crossings & minimize road distance)
  routes = routes.map((route) => {
    const res = twoOptImprove(route, depot);
    iterations += res.iters;
    return res.route;
  });

  // Step F: Inter-Route 1-0 Relocate Local Search (move stop to neighbor truck if strictly shorter)
  let improved = true;
  let relocatePasses = 0;
  while (improved && relocatePasses < 25) {
    improved = false;
    relocatePasses++;

    for (let a = 0; a < routes.length; a++) {
      if (routes[a].length <= 1) continue;
      for (let i = 0; i < routes[a].length; i++) {
        const stop = routes[a][i];
        const currDistA = calcRouteDistance(routes[a], depot);

        for (let b = 0; b < routes.length; b++) {
          if (a === b) continue;
          if (calcRouteWeight(routes[b]) + stop.weightKg > maxWeightKg) continue;

          const currDistB = calcRouteDistance(routes[b], depot);
          const candA = routes[a].filter((_, idx) => idx !== i);
          const newDistA = calcRouteDistance(candA, depot);

          // Find best insertion position in route B
          let bestPos = -1;
          let bestGain = 0.2; // Require at least 0.2 km improvement
          for (let pos = 0; pos <= routes[b].length; pos++) {
            iterations++;
            const candB = [...routes[b].slice(0, pos), stop, ...routes[b].slice(pos)];
            const newDistB = calcRouteDistance(candB, depot);
            const gain = currDistA + currDistB - (newDistA + newDistB);
            if (gain > bestGain) {
              bestGain = gain;
              bestPos = pos;
            }
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
      const twBias = (timeToMin(remaining[i].timeEnd) - 480) / 60 * 0.45;
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
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
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

function finalizeVehicleRoute(stops, depot, idx, maxWeightKg, isBaseline) {
  const totalWeightKg = calcRouteWeight(stops);
  const distanceKm = Math.round(calcRouteDistance(stops, depot) * 100) / 100;
  const loadPct = Math.min(100, Math.round((totalWeightKg / maxWeightKg) * 1000) / 10);
  const { schedule, lateCount, departTime, returnTime, durationMin } = evaluateRouteSchedule(
    stops,
    depot,
    7 * 60 + 30
  );

  // LIFO Loading Sequence: Last stop goes deepest inside truck, Stop #1 sits right at tailgate!
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

  // Straight/fallback polyline coordinates: Depot -> Stops -> Depot
  const fallbackPath = [
    [depot.lat, depot.lng],
    ...schedule.map((s) => [s.lat, s.lng]),
    [depot.lat, depot.lng],
  ];

  // Google Maps multi-stop deep link for the driver
  const waypoints = schedule.map((s) => `${s.lat},${s.lng}`).join('|');
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${depot.lat},${depot.lng}&destination=${depot.lat},${depot.lng}&waypoints=${encodeURIComponent(
    waypoints
  )}&travelmode=driving`;

  return {
    vehicleId: isBaseline ? `before-truck-${idx + 1}` : `truck-${idx + 1}`,
    vehicleName: `รถคันที่ ${idx + 1}`,
    color: isBaseline ? '#b91c1c' : ROUTE_COLORS[idx % ROUTE_COLORS.length],
    stops: schedule,
    lifoOrder,
    totalWeightKg,
    maxWeightKg,
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
export function runFleetOptimization(orders, depot, fleetConfig) {
  const t0 = performance.now();

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

/**
 * Optional Live Road Geometry Enrichment via OSRM public driving server.
 * Fetches actual Bangkok street polylines for both Before and After routes.
 * Fails gracefully (silently keeps fallback polylines) if offline or rate-limited.
 */
export async function enrichWithOSRMRoads(result, depot) {
  const fetchOneRoute = async (route) => {
    const pts = [[depot.lng, depot.lat], ...route.stops.map((s) => [s.lng, s.lat]), [depot.lng, depot.lat]];
    const coordStr = pts.map(([lng, lat]) => `${lng.toFixed(5)},${lat.toFixed(5)}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const json = await res.json();
      const osrmRoute = json?.routes?.[0];
      if (!osrmRoute?.geometry?.coordinates) return null;

      return {
        path: osrmRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
        distanceKm: Math.round((osrmRoute.distance / 1000) * 100) / 100,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const [beforeGeo, afterGeo] = await Promise.all([
      Promise.all(result.beforeRoutes.map(fetchOneRoute)),
      Promise.all(result.afterRoutes.map(fetchOneRoute)),
    ]);

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

/**
 * Deterministic TGO (อบก.) Carbon Footprint & ROI Calculation Engine
 *
 * Official Emission Factors — Thailand Greenhouse Gas Management Organization (TGO):
 * - Diesel Scope 1 (Mobile Combustion): 2.7403 kgCO2e / Liter
 * - Diesel Well-to-Wheel (Scope 1 + Scope 3 Fuel Acquisition): 3.0326 kgCO2e / Liter
 * - Mature Tree CO2 Absorption (TGO standard): ~9.0 kgCO2e / tree / year
 *
 * Strictly deterministic code — NO LLM arithmetic to eliminate Hallucination.
 */

export const TGO_CONSTANTS = {
  DIESEL_EF_SCOPE1: 2.7403, // kgCO2e / Liter (Mobile Combustion)
  DIESEL_EF_WTW_SCOPE3: 3.0326, // kgCO2e / Liter (Well-to-Wheel for B2B Scope 3 reporting)
  TREE_ABSORPTION_KG_PER_YEAR: 9.0, // kgCO2e / tree / year
  WORKING_DAYS_PER_MONTH: 26,
  WORKING_DAYS_PER_YEAR: 312,
  REFERENCE_LABEL: 'องค์การบริหารจัดการก๊าซเรือนกระจก (อบก. / TGO) — บัญชีค่า Emission Factor ของประเทศไทย',
};

export function calculateCarbonAndSavings({
  beforeDistanceKm,
  afterDistanceKm,
  beforeTrucksUsed,
  afterTrucksUsed,
  beforeAvgLoadPct,
  afterAvgLoadPct,
  fuelKmPerLiter = 9.0,
  dieselPricePerLiter = 33.0,
}) {
  const safeKmPerL = Math.max(1, Number(fuelKmPerLiter) || 9.0);
  const safePrice = Math.max(1, Number(dieselPricePerLiter) || 33.0);

  const distSavedKm = Math.max(0, beforeDistanceKm - afterDistanceKm);
  const distSavedPct = beforeDistanceKm > 0 ? (distSavedKm / beforeDistanceKm) * 100 : 0;

  const beforeLiters = beforeDistanceKm / safeKmPerL;
  const afterLiters = afterDistanceKm / safeKmPerL;
  const litersSaved = Math.max(0, beforeLiters - afterLiters);

  const beforeFuelCost = beforeLiters * safePrice;
  const afterFuelCost = afterLiters * safePrice;
  const fuelCostSavedDay = Math.max(0, beforeFuelCost - afterFuelCost);
  const fuelCostSavedMonth = fuelCostSavedDay * TGO_CONSTANTS.WORKING_DAYS_PER_MONTH;
  const fuelCostSavedYear = fuelCostSavedDay * TGO_CONSTANTS.WORKING_DAYS_PER_YEAR;

  // Scope 1: Direct Tailpipe Mobile Combustion (2.7403 kgCO2e/L)
  const beforeCo2Scope1 = beforeLiters * TGO_CONSTANTS.DIESEL_EF_SCOPE1;
  const afterCo2Scope1 = afterLiters * TGO_CONSTANTS.DIESEL_EF_SCOPE1;
  const co2SavedScope1Day = Math.max(0, beforeCo2Scope1 - afterCo2Scope1);
  const co2SavedScope1Month = co2SavedScope1Day * TGO_CONSTANTS.WORKING_DAYS_PER_MONTH;
  const co2SavedScope1Year = co2SavedScope1Day * TGO_CONSTANTS.WORKING_DAYS_PER_YEAR;

  // Well-to-Wheel / Scope 3 B2B Supply Chain Reporting (3.0326 kgCO2e/L)
  const beforeCo2Wtw = beforeLiters * TGO_CONSTANTS.DIESEL_EF_WTW_SCOPE3;
  const afterCo2Wtw = afterLiters * TGO_CONSTANTS.DIESEL_EF_WTW_SCOPE3;
  const co2SavedWtwDay = Math.max(0, beforeCo2Wtw - afterCo2Wtw);
  const co2SavedWtwMonth = co2SavedWtwDay * TGO_CONSTANTS.WORKING_DAYS_PER_MONTH;
  const co2SavedWtwYear = co2SavedWtwDay * TGO_CONSTANTS.WORKING_DAYS_PER_YEAR;

  const treesEquivalentYear = co2SavedScope1Year / TGO_CONSTANTS.TREE_ABSORPTION_KG_PER_YEAR;
  const trucksEliminated = Math.max(0, beforeTrucksUsed - afterTrucksUsed);

  return {
    distance: {
      beforeKm: round2(beforeDistanceKm),
      afterKm: round2(afterDistanceKm),
      savedKm: round2(distSavedKm),
      savedPct: round1(distSavedPct),
    },
    fuel: {
      beforeLiters: round2(beforeLiters),
      afterLiters: round2(afterLiters),
      savedLitersDay: round2(litersSaved),
      savedLitersMonth: round1(litersSaved * TGO_CONSTANTS.WORKING_DAYS_PER_MONTH),
      beforeCostDay: Math.round(beforeFuelCost),
      afterCostDay: Math.round(afterFuelCost),
      savedCostDay: Math.round(fuelCostSavedDay),
      savedCostMonth: Math.round(fuelCostSavedMonth),
      savedCostYear: Math.round(fuelCostSavedYear),
    },
    carbon: {
      beforeScope1Day: round2(beforeCo2Scope1),
      afterScope1Day: round2(afterCo2Scope1),
      savedScope1Day: round2(co2SavedScope1Day),
      savedScope1Month: round1(co2SavedScope1Month),
      savedScope1Year: round1(co2SavedScope1Year),
      beforeWtwDay: round2(beforeCo2Wtw),
      afterWtwDay: round2(afterCo2Wtw),
      savedWtwDay: round2(co2SavedWtwDay),
      savedWtwMonth: round1(co2SavedWtwMonth),
      savedWtwYear: round1(co2SavedWtwYear),
      treesEquivalentYear: Math.round(treesEquivalentYear),
    },
    fleet: {
      beforeTrucksUsed,
      afterTrucksUsed,
      trucksEliminated,
      beforeAvgLoadPct: round1(beforeAvgLoadPct),
      afterAvgLoadPct: round1(afterAvgLoadPct),
      loadGainPct: round1(afterAvgLoadPct - beforeAvgLoadPct),
    },
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

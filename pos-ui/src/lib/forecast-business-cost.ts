export type ForecastBusinessCost = {
  lostMarginPerDay: number;
  holdingCostPerDay: number;
  obsolescenceCostPerDay: number;
  servicePenaltyPerDay: number;
  totalCostPerDay: number;
  fillRate: number;
  evaluatedDays: number;
  evaluatedFolds: number;
};

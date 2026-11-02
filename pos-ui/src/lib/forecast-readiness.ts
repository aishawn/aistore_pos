export type ForecastReadinessProduct = {
  forecastQuality?: string | null;
  confidence?: string | null;
  forecastConfidence?: string | null;
};

export type ForecastReadiness = {
  valid: number;
  insufficientHistory: number;
  lowConfidence: number;
};

export function forecastReadiness(products: ForecastReadinessProduct[]): ForecastReadiness {
  return products.reduce((summary, product) => {
    if (product.forecastQuality === "VALID") summary.valid += 1;
    else if (product.forecastQuality === "INSUFFICIENT_HISTORY") summary.insufficientHistory += 1;
    if (product.confidence === "LOW" || product.forecastConfidence === "LOW") summary.lowConfidence += 1;
    return summary;
  }, { valid: 0, insufficientHistory: 0, lowConfidence: 0 });
}

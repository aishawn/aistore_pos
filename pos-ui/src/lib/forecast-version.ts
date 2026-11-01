const SUPPORTED_FORECAST_MODEL_VERSIONS = new Set(["5", "6"]);

export function isSupportedForecastModelVersion(value: unknown): value is string {
  return typeof value === "string" && SUPPORTED_FORECAST_MODEL_VERSIONS.has(value);
}

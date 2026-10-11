/** A single tile on the Shopfront "Sell" keypad. */
export interface SaleKey {
  /** Stable id / key name. */
  id: string;
  /** Local path to the button-face PNG (icon + label baked in). Null = text-only key. */
  image: string | null;
  /** Fallback / visible text label for text-only keys (e.g. department buttons). */
  label?: string;
  /** Tile background colour (CSS value). */
  bg: string;
  /** Text colour for text-only keys. */
  textColor?: string;
  /** 1-based grid column start (10-column grid). */
  colStart: number;
  /** Number of columns the tile spans. */
  colSpan: number;
  /** 1-based grid row start (10-row grid). */
  rowStart: number;
  /** Number of rows the tile spans. */
  rowSpan: number;
  /** Whether the key is disabled (dimmed via brightness(0.5), not-allowed cursor). */
  disabled?: boolean;
}

/** Footer sale summary shown above the Finalise button. */
export interface SaleSummary {
  productCount: number;
  savings: string;
  discount: string;
  total: string;
}

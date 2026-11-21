export interface SellLayoutClasses {
  quickKeys: string;
  checkout: string;
  grid: string;
}

const RIGHT_LAYOUT: SellLayoutClasses = {
  quickKeys: "order-2 lg:order-none lg:col-start-2 lg:row-start-2",
  checkout: "order-3 lg:col-start-1 lg:row-start-2 lg:w-auto",
  grid: "lg:grid-cols-[380px_minmax(0,1fr)] lg:grid-rows-[auto_minmax(0,1fr)]",
};

const LEFT_LAYOUT: SellLayoutClasses = {
  quickKeys: "order-2 lg:order-none lg:col-start-1 lg:row-start-2",
  checkout: "order-3 lg:col-start-2 lg:row-start-2 lg:w-auto",
  grid: "lg:grid-cols-[minmax(0,1fr)_380px] lg:grid-rows-[auto_minmax(0,1fr)]",
};

const BOTTOM_LAYOUT: SellLayoutClasses = {
  quickKeys: "order-3 lg:col-span-2 lg:col-start-1 lg:row-start-3",
  checkout: "order-2 lg:col-span-2 lg:col-start-1 lg:row-start-2 lg:w-auto",
  grid: "lg:grid-cols-2 lg:grid-rows-[auto_minmax(0,1fr)_minmax(0,1fr)]",
};

export function getSellLayoutClasses(position: string | null | undefined): SellLayoutClasses {
  switch (position?.trim().toUpperCase()) {
    case "LEFT":
      return LEFT_LAYOUT;
    case "BOTTOM":
      return BOTTOM_LAYOUT;
    case "RIGHT":
    default:
      return RIGHT_LAYOUT;
  }
}

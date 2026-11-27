import { api } from "@/lib/api";

export type CompetitorSource = {
  id: number;
  sourceKey: string;
  name: string;
  baseUrl: string;
  sourceType: "MANUFACTURER" | "RETAILER";
  accessMode: "UNREVIEWED" | "MANUAL_ONLY" | "AUTOMATION_ALLOWED" | "LICENSED_FEED" | "BLOCKED";
  termsUrl: string | null;
  termsReviewedAt: string | null;
  reviewSummary: string | null;
  permittedFields: string | null;
  retentionTerms: string | null;
  rateLimitTerms: string | null;
  enabled: boolean;
  postcode: string | null;
  fulfillment: "DELIVERY" | "PICKUP" | "IN_STORE" | null;
  refreshDays: number;
};

export type CompetitorObservation = {
  id: number;
  productId: number;
  sourceId: number;
  competitor: string;
  sourceType: "MANUFACTURER" | "RETAILER";
  competitorProductName: string;
  barcode: string | null;
  volumeMl: number | null;
  vintage: string | null;
  packSize: number;
  priceType: "STANDARD" | "PROMOTION" | "MULTIBUY" | "MEMBER" | "CLEARANCE";
  priceTaxBasis: "INCLUDES_GST" | "EXCLUDES_GST" | "UNKNOWN";
  observedPrice: number;
  memberPrice: number | null;
  unitPrice: number | null;
  unitPriceBasis: "PER_UNIT" | "PER_LITRE";
  promotionTerms: string | null;
  promotionStartsAt: string | null;
  promotionEndsAt: string | null;
  postcode: string;
  fulfillment: string;
  sourceUrl: string;
  evidenceUrl: string | null;
  captureMethod: string;
  matchMethod: string;
  matchConfidence: number | null;
  reviewStatus: "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  matchReviewStatus: "PENDING" | "PASS" | "FAIL";
  priceReviewStatus: "PENDING" | "PASS" | "FAIL";
  observedAt: string;
  observedTimezone: string;
  verifiedAt: string | null;
  createdBy: number | null;
  reviewNote: string | null;
};

export type CompetitorObservationInput = Omit<CompetitorObservation,
  "id" | "competitor" | "sourceType" | "captureMethod" | "reviewStatus" | "matchReviewStatus" | "priceReviewStatus"
  | "verifiedAt" | "createdBy" | "reviewNote" | "unitPrice" | "unitPriceBasis">;

export function getCompetitorSources() {
  return api.get<CompetitorSource[]>("/api/competition-prices/sources");
}

export function addCustomCompetitorSource(name: string, sourceType: CompetitorSource["sourceType"], baseUrl: string) {
  return api.post<CompetitorSource[]>("/api/competition-prices/sources", { name, sourceType, baseUrl });
}

export function configureCompetitorSource(sourceId: number, input: Pick<CompetitorSource, "postcode" | "fulfillment" | "enabled" | "refreshDays">) {
  return api.put<CompetitorSource[]>(`/api/competition-prices/sources/${sourceId}`, input);
}

export function configureCompetitorSourcePermission(sourceId: number, input: {
  accessMode: "UNREVIEWED" | "MANUAL_ONLY" | "BLOCKED";
  termsUrl?: string | null;
  reviewSummary?: string;
  permittedFields?: string;
  retentionTerms?: string;
  rateLimitTerms?: string;
  confirmedReview: boolean;
}) {
  return api.put<CompetitorSource[]>(`/api/competition-prices/sources/${sourceId}/permission`, input);
}

export function getCompetitorObservations(productIds: number[], includePending = false) {
  if (!productIds.length) return Promise.resolve([] as CompetitorObservation[]);
  return api.get<CompetitorObservation[]>("/api/competition-prices/observations", {
    productIds: productIds.join(","),
    includePending,
  });
}

export function addCompetitorObservation(input: CompetitorObservationInput) {
  return api.post<CompetitorObservation>("/api/competition-prices/observations", input);
}

export function reviewCompetitorObservation(id: number, input: {
  matchStatus: "PASS" | "FAIL";
  priceStatus: "PASS" | "FAIL";
  matchNote: string | null;
  priceNote: string | null;
}) {
  return api.post<void>(`/api/competition-prices/observations/${id}/review`, input);
}

export function logPriceSuggestionInteraction(input: {
  productId: number;
  eventType: "VIEW" | "OPEN_PRODUCT" | "OPEN_BULK_EDIT";
  currentPrice: number | null;
  suggestedPrice: number | null;
  marginTarget: number;
  pageGeneratedAt: string;
}) {
  return api.post<void>("/api/competition-prices/suggestion-interactions", input);
}

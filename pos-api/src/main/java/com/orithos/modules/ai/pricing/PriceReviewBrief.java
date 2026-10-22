package com.orithos.modules.ai.pricing;

import java.util.List;

/** Read-only price review slice for the assistant chat brief. */
public record PriceReviewBrief(double marginTarget, List<PriceReviewItem> top) {
}

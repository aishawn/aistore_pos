package com.orithos.modules.product;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.product.mapper.CompetitorPriceMapper;
import com.orithos.security.AdminAccess;
import com.orithos.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.DateTimeException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/competition-prices")
public class CompetitorPriceController {
    private final CompetitorPriceMapper mapper;

    public CompetitorPriceController(CompetitorPriceMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping("/sources")
    public ApiResult<List<CompetitorSourceView>> sources() {
        Scope scope = requireScope();
        return ApiResult.ok(mapper.listSources(scope.vendorId(), scope.outletId()));
    }

    @PostMapping("/sources")
    public ApiResult<List<CompetitorSourceView>> addCustomSource(@Valid @RequestBody CustomSourceRequest body) {
        Scope scope = requireScope();
        URI url = safeHttpUri(body.baseUrl());
        mapper.insertCustomSource(scope.vendorId(), "custom-" + UUID.randomUUID(), body.name().trim(),
                body.sourceType(), url.toString());
        return ApiResult.ok(mapper.listSources(scope.vendorId(), scope.outletId()));
    }

    @PutMapping("/sources/{sourceId}/permission")
    @Transactional
    public ApiResult<List<CompetitorSourceView>> reviewSourcePermission(
            @PathVariable Long sourceId, @Valid @RequestBody SourcePermissionRequest body) {
        Scope scope = requireScope();
        AdminAccess.requireAdmin();
        if (mapper.sourceAccessMode(sourceId, scope.vendorId()) == null) {
            throw new BusinessException(40410, "Competitor source not found.");
        }
        String mode = body.accessMode();
        if (!List.of("UNREVIEWED", "MANUAL_ONLY", "BLOCKED").contains(mode)) {
            throw new BusinessException(40000, "Only UNREVIEWED, MANUAL_ONLY, or BLOCKED can be set.");
        }
        String termsUrl = null;
        if ("MANUAL_ONLY".equals(mode)) {
            if (!body.confirmedReview()) {
                throw new BusinessException(40000, "Confirm that the source terms permit manual commercial price collection and storage.");
            }
            if (isBlank(body.reviewSummary()) || isBlank(body.permittedFields())
                    || isBlank(body.retentionTerms()) || isBlank(body.rateLimitTerms())) {
                throw new BusinessException(40000, "Record the permission decision, permitted fields, retention terms, and rate limits before approval.");
            }
            termsUrl = safeHttpUri(body.termsUrl()).toString();
        }
        Long reviewerId = CurrentUser.id();
        if (mapper.saveSourcePermission(scope.vendorId(), sourceId, mode, termsUrl, reviewerId,
                trimToEmpty(body.reviewSummary()), trimToEmpty(body.permittedFields()),
                trimToEmpty(body.retentionTerms()), trimToEmpty(body.rateLimitTerms())) == 0) {
            throw new BusinessException(40410, "Competitor source not found.");
        }
        return ApiResult.ok(mapper.listSources(scope.vendorId(), scope.outletId()));
    }

    @PutMapping("/sources/{sourceId}")
    public ApiResult<List<CompetitorSourceView>> configureSource(@PathVariable Long sourceId,
                                                                  @Valid @RequestBody SourcePreferenceRequest body) {
        Scope scope = requireScope();
        String accessMode = mapper.sourceAccessMode(sourceId, scope.vendorId());
        if (accessMode == null) throw new BusinessException(40410, "Competitor source not found.");
        if (body.enabled() && List.of("UNREVIEWED", "BLOCKED").contains(accessMode)) {
            throw new BusinessException(40000, "This source cannot be enabled until its terms and access mode are reviewed.");
        }
        int refreshDays = Math.min(90, Math.max(1, body.refreshDays() == null ? 7 : body.refreshDays()));
        String fulfillment = normalizeFulfillment(body.fulfillment());
        if (mapper.savePreference(scope.vendorId(), scope.outletId(), sourceId,
                body.postcode().trim(), fulfillment, body.enabled(), refreshDays) == 0) {
            throw new BusinessException(40410, "Outlet not found.");
        }
        return ApiResult.ok(mapper.listSources(scope.vendorId(), scope.outletId()));
    }

    @GetMapping("/observations")
    public ApiResult<List<CompetitorPriceObservation>> observations(
            @RequestParam String productIds,
            @RequestParam(defaultValue = "false") boolean includePending) {
        Scope scope = requireScope();
        List<Long> ids;
        try {
            ids = java.util.Arrays.stream(productIds.split(","))
                    .map(String::trim).filter(value -> !value.isEmpty()).map(Long::valueOf).distinct().toList();
        } catch (RuntimeException ex) {
            throw new BusinessException(40000, "productIds must be a comma-separated list of product IDs.");
        }
        if (ids.isEmpty() || ids.size() > 100) return ApiResult.ok(List.of());
        return ApiResult.ok(mapper.verifiedForProducts(scope.vendorId(), scope.outletId(), ids, includePending));
    }

    @PostMapping("/suggestion-interactions")
    public ApiResult<Void> logSuggestionInteraction(@Valid @RequestBody SuggestionInteractionRequest body) {
        Scope scope = requireScope();
        if (body.pageGeneratedAt().isAfter(OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(5))) {
            throw new BusinessException(40000, "Suggestion generation time cannot be in the future.");
        }
        if (!mapper.productBelongsToOutlet(body.productId(), scope.vendorId(), scope.outletId())) {
            throw new BusinessException(40410, "Product not found in this outlet.");
        }
        if (mapper.insertSuggestionInteraction(scope.vendorId(), scope.outletId(), body.productId(), CurrentUser.id(),
                body.eventType(), body.currentPrice(), body.suggestedPrice(), body.marginTarget(),
                body.pageGeneratedAt().withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime()) == 0) {
            throw new BusinessException(40410, "Product not found in this outlet.");
        }
        return ApiResult.ok();
    }

    @PostMapping("/observations")
    public ApiResult<CompetitorPriceObservation> addObservation(@Valid @RequestBody ObservationRequest body) {
        Scope scope = requireScope();
        ZoneId observationZone;
        try {
            observationZone = ZoneId.of(body.observedTimezone());
        } catch (DateTimeException ex) {
            throw new BusinessException(40000, "A valid IANA store timezone is required.");
        }
        LocalDateTime observedAtUtc = toUtc(body.observedAt(), observationZone);
        LocalDateTime promotionStartsAtUtc = body.promotionStartsAt() == null ? null : toUtc(body.promotionStartsAt(), observationZone);
        LocalDateTime promotionEndsAtUtc = body.promotionEndsAt() == null ? null : toUtc(body.promotionEndsAt(), observationZone);
        if (promotionStartsAtUtc != null && promotionEndsAtUtc != null
                && !promotionEndsAtUtc.isAfter(promotionStartsAtUtc)) {
            throw new BusinessException(40000, "Promotion end must be later than its start.");
        }
        if (observedAtUtc.isAfter(LocalDateTime.now(ZoneOffset.UTC).plusMinutes(5))) {
            throw new BusinessException(40000, "Observation time cannot be in the future.");
        }
        String priceType = body.priceType() == null ? "STANDARD" : body.priceType();
        if (!"STANDARD".equals(priceType) && (body.promotionTerms() == null || body.promotionTerms().isBlank())) {
            throw new BusinessException(40000, "Promotion, member, multibuy, and clearance prices need their conditions recorded.");
        }
        if (!mapper.productBelongsToOutlet(body.productId(), scope.vendorId(), scope.outletId())) {
            throw new BusinessException(40410, "Product not found in this outlet.");
        }
        String fulfillment = normalizeFulfillment(body.fulfillment());
        if (!mapper.sourceConfigurationMatches(body.sourceId(), scope.vendorId(), scope.outletId(),
                body.postcode().trim(), fulfillment)) {
            throw new BusinessException(40000, "Enable this competitor source for the outlet first.");
        }
        String accessMode = mapper.sourceAccessMode(body.sourceId(), scope.vendorId());
        if (!"MANUAL_ONLY".equals(accessMode)) {
            throw new BusinessException(40000, "Manual price collection is disabled until this source is explicitly approved for manual use.");
        }
        URI sourceUrl = safeHttpUri(body.sourceUrl());
        URI sourceBase = URI.create(mapper.listSources(scope.vendorId(), scope.outletId()).stream()
                .filter(s -> s.getId().equals(body.sourceId())).findFirst().orElseThrow().getBaseUrl());
        String baseHost = sourceBase.getHost().toLowerCase().replaceFirst("^www\\.", "");
        String sourceHost = sourceUrl.getHost().toLowerCase().replaceFirst("^www\\.", "");
        if (!(sourceHost.equals(baseHost) || sourceHost.endsWith("." + baseHost))) {
            throw new BusinessException(40000, "Source URL must belong to the selected competitor domain.");
        }
        CompetitorPriceObservation observation = new CompetitorPriceObservation();
        observation.setProductId(body.productId());
        observation.setSourceId(body.sourceId());
        observation.setCompetitorProductName(body.competitorProductName().trim());
        observation.setBarcode(trimToNull(body.barcode()));
        observation.setVolumeMl(body.volumeMl());
        observation.setVintage(trimToNull(body.vintage()));
        observation.setPackSize(body.packSize() == null ? 1 : body.packSize());
        observation.setPriceType(priceType);
        observation.setPriceTaxBasis(body.priceTaxBasis());
        observation.setObservedPrice(body.observedPrice());
        observation.setMemberPrice(body.memberPrice());
        boolean perLitre = body.volumeMl() != null && body.volumeMl() > 0;
        observation.setUnitPrice(calculateUnitPrice(body.observedPrice(), body.volumeMl(), observation.getPackSize()));
        observation.setUnitPriceBasis(perLitre ? "PER_LITRE" : "PER_UNIT");
        observation.setPromotionTerms(trimToNull(body.promotionTerms()));
        observation.setPromotionStartsAt(promotionStartsAtUtc);
        observation.setPromotionEndsAt(promotionEndsAtUtc);
        observation.setPostcode(body.postcode().trim());
        observation.setFulfillment(fulfillment);
        observation.setSourceUrl(sourceUrl.toString());
        observation.setEvidenceUrl(body.evidenceUrl() == null ? null : safeHttpUri(body.evidenceUrl()).toString());
        observation.setMatchMethod(body.matchMethod() == null ? "MANUAL" : body.matchMethod());
        observation.setMatchConfidence(body.matchConfidence());
        observation.setObservedAt(observedAtUtc);
        observation.setObservedTimezone(observationZone.getId());
        if (mapper.insertObservation(scope.vendorId(), scope.outletId(), CurrentUser.id(), observation) == 0) {
            throw new BusinessException(40000, "Source permission was revoked or is no longer valid.");
        }
        observation.setReviewStatus("PENDING_REVIEW");
        observation.setMatchReviewStatus("PENDING");
        observation.setPriceReviewStatus("PENDING");
        observation.setCaptureMethod("MANUAL");
        return ApiResult.ok(observation);
    }

    @PostMapping("/observations/{id}/review")
    @Transactional
    public ApiResult<Void> review(@PathVariable Long id, @Valid @RequestBody ReviewRequest body) {
        Scope scope = requireScope();
        if (!mapper.isPendingForOutlet(id, scope.vendorId(), scope.outletId())) {
            throw new BusinessException(40410, "Pending observation not found.");
        }
        Long reviewerId = CurrentUser.id();
        if (reviewerId == null) throw new BusinessException(40100, "Authenticated user is required.");
        if (reviewerId.equals(mapper.observationCreator(id, scope.vendorId(), scope.outletId()))) {
            throw new BusinessException(40300, "A different user must review the observation.");
        }
        if ("FAIL".equals(body.matchStatus()) && isBlank(body.matchNote())) {
            throw new BusinessException(40000, "A reason is required when product matching fails.");
        }
        if ("FAIL".equals(body.priceStatus()) && isBlank(body.priceNote())) {
            throw new BusinessException(40000, "A reason is required when price verification fails.");
        }
        String status = "PASS".equals(body.matchStatus()) && "PASS".equals(body.priceStatus())
                ? "VERIFIED" : "REJECTED";
        String note = "Match=" + body.matchStatus() + "; Price=" + body.priceStatus();
        if (mapper.review(id, scope.vendorId(), scope.outletId(), reviewerId, status,
                body.matchStatus(), body.priceStatus(), note) == 0) {
            throw new BusinessException(40900, "Observation was reviewed by another user. Reload and check its status.");
        }
        mapper.insertReviewAudit(id, scope.vendorId(), scope.outletId(), reviewerId,
                body.matchStatus(), body.priceStatus(), trimToNull(body.matchNote()), trimToNull(body.priceNote()));
        return ApiResult.ok();
    }

    private static Scope requireScope() {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        return new Scope(vendorId, outletId);
    }

    private static URI safeHttpUri(String value) {
        try {
            URI uri = URI.create(value.trim());
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null || uri.getUserInfo() != null) throw new IllegalArgumentException();
            return uri;
        } catch (RuntimeException ex) {
            throw new BusinessException(40000, "A valid public HTTP or HTTPS URL is required.");
        }
    }

    private static String normalizeFulfillment(String value) {
        String normalized = value == null ? "DELIVERY" : value.trim().toUpperCase();
        if (!List.of("DELIVERY", "PICKUP", "IN_STORE").contains(normalized)) {
            throw new BusinessException(40000, "Fulfillment must be DELIVERY, PICKUP, or IN_STORE.");
        }
        return normalized;
    }

    private static String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static boolean isBlank(String value) { return value == null || value.isBlank(); }

    private static String trimToEmpty(String value) { return value == null ? "" : value.trim(); }

    static BigDecimal calculateUnitPrice(BigDecimal price, Integer volumeMl, int packSize) {
        BigDecimal comparisonUnits = BigDecimal.valueOf((long) (volumeMl != null && volumeMl > 0 ? volumeMl : 1) * packSize);
        return volumeMl != null && volumeMl > 0
                ? price.multiply(BigDecimal.valueOf(1000)).divide(comparisonUnits, 4, RoundingMode.HALF_UP)
                : price.divide(comparisonUnits, 4, RoundingMode.HALF_UP);
    }

    static LocalDateTime toUtc(LocalDateTime localTime, ZoneId zone) {
        if (localTime == null) return null;
        var offsets = zone.getRules().getValidOffsets(localTime);
        if (offsets.size() != 1) {
            throw new BusinessException(40000, "The entered local time is ambiguous or invalid because of a daylight-saving transition.");
        }
        return localTime.atOffset(offsets.get(0)).withOffsetSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }

    private record Scope(Long vendorId, Long outletId) {}

    public record SourcePreferenceRequest(
            @NotBlank @Pattern(regexp = "[0-9A-Za-z -]{3,12}") String postcode,
            @NotBlank String fulfillment,
            boolean enabled,
            Integer refreshDays) {}

    public record CustomSourceRequest(@NotBlank String name,
            @NotBlank @Pattern(regexp = "MANUFACTURER|RETAILER") String sourceType,
            @NotBlank String baseUrl) {}

    public record SourcePermissionRequest(
            @NotBlank @Pattern(regexp = "UNREVIEWED|MANUAL_ONLY|BLOCKED") String accessMode,
            String termsUrl,
            String reviewSummary,
            String permittedFields,
            String retentionTerms,
            String rateLimitTerms,
            boolean confirmedReview) {}

    public record ObservationRequest(
            @NotNull @Positive Long productId,
            @NotNull @Positive Long sourceId,
            @NotBlank String competitorProductName,
            String barcode,
            @Positive Integer volumeMl,
            String vintage,
            @Positive Integer packSize,
            @Pattern(regexp = "STANDARD|PROMOTION|MULTIBUY|MEMBER|CLEARANCE") String priceType,
            @NotBlank @Pattern(regexp = "INCLUDES_GST|EXCLUDES_GST|UNKNOWN") String priceTaxBasis,
            @NotNull @DecimalMin("0.01") BigDecimal observedPrice,
            @DecimalMin("0.01") BigDecimal memberPrice,
            String promotionTerms,
            LocalDateTime promotionStartsAt,
            LocalDateTime promotionEndsAt,
            @NotBlank @Pattern(regexp = "[0-9A-Za-z -]{3,12}") String postcode,
            @NotBlank String fulfillment,
            @NotBlank String sourceUrl,
            @NotBlank String evidenceUrl,
            @Pattern(regexp = "EAN|ATTRIBUTE|MANUAL") String matchMethod,
            @DecimalMin("0.0") @DecimalMax("1.0") BigDecimal matchConfidence,
            @NotNull LocalDateTime observedAt,
            @NotBlank String observedTimezone) {}

    public record ReviewRequest(
            @NotBlank @Pattern(regexp = "PASS|FAIL") String matchStatus,
            @NotBlank @Pattern(regexp = "PASS|FAIL") String priceStatus,
            @Size(max = 1024) String matchNote,
            @Size(max = 1024) String priceNote) {}

    public record SuggestionInteractionRequest(
            @NotNull @Positive Long productId,
            @NotBlank @Pattern(regexp = "VIEW|OPEN_PRODUCT|OPEN_BULK_EDIT") String eventType,
            @DecimalMin("0.0") BigDecimal currentPrice,
            @DecimalMin("0.01") BigDecimal suggestedPrice,
            @DecimalMin("0.0") @DecimalMax("1.0") BigDecimal marginTarget,
            @NotNull OffsetDateTime pageGeneratedAt) {}
}

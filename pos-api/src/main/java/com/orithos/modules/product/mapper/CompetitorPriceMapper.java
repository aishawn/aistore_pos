package com.orithos.modules.product.mapper;

import com.orithos.modules.product.CompetitorPriceObservation;
import com.orithos.modules.product.CompetitorSourceView;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CompetitorPriceMapper {
    @Select("""
            SELECT s.id, s.source_key AS sourceKey, s.name, s.base_url AS baseUrl, s.source_type AS sourceType,
                   COALESCE(vp.access_mode, 'UNREVIEWED') AS accessMode,
                   vp.terms_url AS termsUrl, vp.terms_reviewed_at AS termsReviewedAt,
                   vp.review_summary AS reviewSummary, vp.permitted_fields AS permittedFields,
                   vp.retention_terms AS retentionTerms, vp.rate_limit_terms AS rateLimitTerms,
                   (COALESCE(c.enabled, 0) = 1 AND vp.access_mode = 'MANUAL_ONLY'
                    AND vp.terms_url IS NOT NULL AND vp.terms_reviewed_at IS NOT NULL
                    AND vp.terms_reviewed_by IS NOT NULL) AS enabled,
                   c.postcode, c.fulfillment, COALESCE(c.refresh_days, 7) AS refreshDays
            FROM competitor_price_source s
            LEFT JOIN vendor_competitor_source_permission vp
              ON vp.source_id = s.id AND vp.vendor_id = #{vendorId}
            LEFT JOIN outlet_competitor_source c
              ON c.source_id = s.id AND c.vendor_id = #{vendorId} AND c.outlet_id = #{outletId}
            WHERE s.enabled = 1 AND (s.vendor_id IS NULL OR s.vendor_id = #{vendorId})
            ORDER BY s.name
            """)
    List<CompetitorSourceView> listSources(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT COALESCE(vp.access_mode, 'UNREVIEWED') FROM competitor_price_source s LEFT JOIN vendor_competitor_source_permission vp ON vp.source_id = s.id AND vp.vendor_id = #{vendorId} WHERE s.id = #{sourceId} AND s.enabled = 1 AND (s.vendor_id IS NULL OR s.vendor_id = #{vendorId})")
    String sourceAccessMode(@Param("sourceId") Long sourceId, @Param("vendorId") Long vendorId);

    @Insert("""
            WITH saved AS (
            INSERT INTO vendor_competitor_source_permission
              (vendor_id, source_id, access_mode, terms_url, terms_reviewed_at, terms_reviewed_by,
               review_summary, permitted_fields, retention_terms, rate_limit_terms, updated_at)
            SELECT #{vendorId}, s.id, #{accessMode}, #{termsUrl},
                   CASE WHEN #{accessMode} = 'MANUAL_ONLY' THEN CURRENT_TIMESTAMP AT TIME ZONE 'UTC' ELSE NULL END,
                   CASE WHEN #{accessMode} = 'MANUAL_ONLY' THEN #{reviewerId} ELSE NULL END,
                   #{reviewSummary}, #{permittedFields}, #{retentionTerms}, #{rateLimitTerms},
                   CURRENT_TIMESTAMP
            FROM competitor_price_source s
            WHERE s.id = #{sourceId} AND s.enabled = 1
              AND (s.vendor_id IS NULL OR s.vendor_id = #{vendorId})
              AND (#{accessMode} <> 'MANUAL_ONLY' OR CAST(#{termsUrl} AS VARCHAR) IS NOT NULL)
            ON CONFLICT (vendor_id, source_id) DO UPDATE SET
              access_mode = EXCLUDED.access_mode, terms_url = EXCLUDED.terms_url,
              terms_reviewed_at = EXCLUDED.terms_reviewed_at,
              terms_reviewed_by = EXCLUDED.terms_reviewed_by,
              review_summary = EXCLUDED.review_summary, permitted_fields = EXCLUDED.permitted_fields,
              retention_terms = EXCLUDED.retention_terms, rate_limit_terms = EXCLUDED.rate_limit_terms,
              updated_at = CURRENT_TIMESTAMP
            RETURNING vendor_id, source_id, access_mode, terms_url, review_summary,
                      permitted_fields, retention_terms, rate_limit_terms
            )
            INSERT INTO vendor_competitor_source_permission_audit
              (vendor_id, source_id, access_mode, terms_url, review_summary, permitted_fields,
               retention_terms, rate_limit_terms, reviewed_by, reviewed_at)
            SELECT vendor_id, source_id, access_mode, terms_url, review_summary, permitted_fields,
                   retention_terms, rate_limit_terms, #{reviewerId}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
            FROM saved
            """)
    int saveSourcePermission(@Param("vendorId") Long vendorId, @Param("sourceId") Long sourceId,
                             @Param("accessMode") String accessMode, @Param("termsUrl") String termsUrl,
                             @Param("reviewerId") Long reviewerId, @Param("reviewSummary") String reviewSummary,
                             @Param("permittedFields") String permittedFields, @Param("retentionTerms") String retentionTerms,
                             @Param("rateLimitTerms") String rateLimitTerms);

    @Insert("""
            INSERT INTO competitor_price_source (vendor_id, source_key, name, source_type, base_url, access_mode)
            VALUES (#{vendorId}, #{sourceKey}, #{name}, #{sourceType}, #{baseUrl}, 'UNREVIEWED')
            """)
    int insertCustomSource(@Param("vendorId") Long vendorId, @Param("sourceKey") String sourceKey,
                           @Param("name") String name, @Param("sourceType") String sourceType,
                           @Param("baseUrl") String baseUrl);

    @Insert("""
            INSERT INTO outlet_competitor_source
              (vendor_id, outlet_id, source_id, postcode, fulfillment, enabled, refresh_days, updated_at)
            SELECT #{vendorId}, #{outletId}, #{sourceId}, #{postcode}, #{fulfillment}, #{enabled}, #{refreshDays}, CURRENT_TIMESTAMP
            WHERE EXISTS (SELECT 1 FROM outlet WHERE id = #{outletId} AND vendor_id = #{vendorId} AND deleted_at IS NULL)
              AND (#{enabled} = FALSE OR EXISTS (
                SELECT 1 FROM competitor_price_source s
                JOIN vendor_competitor_source_permission vp ON vp.source_id = s.id AND vp.vendor_id = #{vendorId}
                WHERE s.id = #{sourceId} AND s.enabled = 1 AND vp.access_mode = 'MANUAL_ONLY'
                  AND vp.terms_url IS NOT NULL AND vp.terms_reviewed_at IS NOT NULL AND vp.terms_reviewed_by IS NOT NULL
              ))
            ON CONFLICT (outlet_id, source_id) DO UPDATE SET
              postcode = EXCLUDED.postcode, fulfillment = EXCLUDED.fulfillment,
              enabled = EXCLUDED.enabled, refresh_days = EXCLUDED.refresh_days, updated_at = CURRENT_TIMESTAMP
            """)
    int savePreference(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                       @Param("sourceId") Long sourceId, @Param("postcode") String postcode,
                       @Param("fulfillment") String fulfillment, @Param("enabled") boolean enabled,
                       @Param("refreshDays") int refreshDays);

    @Select("""
            SELECT EXISTS (
              SELECT 1 FROM product p JOIN outlet o ON o.id = p.outlet_id
              WHERE p.id = #{productId} AND p.outlet_id = #{outletId} AND o.vendor_id = #{vendorId}
                AND p.deleted_at IS NULL AND o.deleted_at IS NULL
            )
            """)
    boolean productBelongsToOutlet(@Param("productId") Long productId, @Param("vendorId") Long vendorId,
                                   @Param("outletId") Long outletId);

    @Insert("""
            INSERT INTO price_suggestion_interaction
              (vendor_id, outlet_id, product_id, user_id, event_type, current_price,
               suggested_price, margin_target, page_generated_at)
            SELECT #{vendorId}, #{outletId}, #{productId}, #{userId}, #{eventType},
                   #{currentPrice}, #{suggestedPrice}, #{marginTarget}, #{pageGeneratedAt}
            WHERE EXISTS (
              SELECT 1 FROM product p JOIN outlet o ON o.id = p.outlet_id
              WHERE p.id = #{productId} AND p.outlet_id = #{outletId} AND o.vendor_id = #{vendorId}
                AND p.deleted_at IS NULL AND o.deleted_at IS NULL
            )
            """)
    int insertSuggestionInteraction(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                                    @Param("productId") Long productId, @Param("userId") Long userId,
                                    @Param("eventType") String eventType,
                                    @Param("currentPrice") BigDecimal currentPrice,
                                    @Param("suggestedPrice") BigDecimal suggestedPrice,
                                    @Param("marginTarget") BigDecimal marginTarget,
                                    @Param("pageGeneratedAt") LocalDateTime pageGeneratedAt);

    @Select("""
            SELECT EXISTS (SELECT 1 FROM outlet_competitor_source
              WHERE vendor_id = #{vendorId} AND outlet_id = #{outletId}
                AND source_id = #{sourceId} AND enabled = 1)
            """)
    boolean sourceEnabledForOutlet(@Param("sourceId") Long sourceId, @Param("vendorId") Long vendorId,
                                   @Param("outletId") Long outletId);

    @Select("""
            SELECT EXISTS (SELECT 1 FROM outlet_competitor_source
              WHERE vendor_id = #{vendorId} AND outlet_id = #{outletId} AND source_id = #{sourceId}
                AND enabled = 1 AND postcode = #{postcode} AND fulfillment = #{fulfillment})
            """)
    boolean sourceConfigurationMatches(@Param("sourceId") Long sourceId, @Param("vendorId") Long vendorId,
                                       @Param("outletId") Long outletId, @Param("postcode") String postcode,
                                       @Param("fulfillment") String fulfillment);

    @Insert("""
            INSERT INTO competitor_price_observation
              (vendor_id, outlet_id, product_id, source_id, competitor_product_name, barcode,
               volume_ml, vintage, pack_size, price_type, price_tax_basis, observed_price, member_price, unit_price, unit_price_basis,
               promotion_terms, promotion_starts_at, promotion_ends_at, postcode, fulfillment,
               source_url, evidence_url, capture_method, match_method, match_confidence,
               review_status, observed_at, observed_timezone, created_by)
            SELECT
              #{vendorId}, #{outletId}, #{observation.productId}, #{observation.sourceId}, #{observation.competitorProductName}, #{observation.barcode},
               #{observation.volumeMl}, #{observation.vintage}, #{observation.packSize}, #{observation.priceType}, #{observation.priceTaxBasis}, #{observation.observedPrice}, #{observation.memberPrice}, #{observation.unitPrice}, #{observation.unitPriceBasis},
               #{observation.promotionTerms}, #{observation.promotionStartsAt}, #{observation.promotionEndsAt}, #{observation.postcode}, #{observation.fulfillment},
               #{observation.sourceUrl}, #{observation.evidenceUrl}, 'MANUAL', #{observation.matchMethod}, #{observation.matchConfidence},
               'PENDING_REVIEW', #{observation.observedAt}, #{observation.observedTimezone}, #{createdBy}
            WHERE EXISTS (
              SELECT 1 FROM vendor_competitor_source_permission vp
              WHERE vp.vendor_id = #{vendorId} AND vp.source_id = #{observation.sourceId}
                AND vp.access_mode = 'MANUAL_ONLY' AND vp.terms_url IS NOT NULL
                AND vp.terms_reviewed_at IS NOT NULL AND vp.terms_reviewed_by IS NOT NULL
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "observation.id")
    int insertObservation(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                          @Param("createdBy") Long createdBy,
                          @Param("observation") CompetitorPriceObservation observation);

    @Select("""
            <script>
            SELECT o.id, o.product_id AS productId, o.source_id AS sourceId, s.name AS competitor,
                   s.source_type AS sourceType,
                   o.competitor_product_name AS competitorProductName, o.barcode, o.volume_ml AS volumeMl,
                   o.vintage, o.pack_size AS packSize, o.price_type AS priceType,
                   o.price_tax_basis AS priceTaxBasis, o.observed_price AS observedPrice,
                   o.member_price AS memberPrice, o.unit_price AS unitPrice, o.unit_price_basis AS unitPriceBasis, o.promotion_terms AS promotionTerms,
                   o.promotion_starts_at AS promotionStartsAt, o.promotion_ends_at AS promotionEndsAt,
                   o.postcode, o.fulfillment, o.source_url AS sourceUrl, o.evidence_url AS evidenceUrl,
                   o.capture_method AS captureMethod, o.match_method AS matchMethod,
                   o.match_confidence AS matchConfidence, o.review_status AS reviewStatus,
                   o.match_review_status AS matchReviewStatus, o.price_review_status AS priceReviewStatus,
                   o.observed_at AS observedAt, o.observed_timezone AS observedTimezone, o.verified_at AS verifiedAt,
                   o.created_by AS createdBy, o.review_note AS reviewNote
            FROM competitor_price_observation o
            JOIN competitor_price_source s ON s.id = o.source_id
            JOIN vendor_competitor_source_permission vp ON vp.source_id = s.id AND vp.vendor_id = o.vendor_id
            JOIN outlet_competitor_source c ON c.source_id = o.source_id
              AND c.vendor_id = o.vendor_id AND c.outlet_id = o.outlet_id
              AND c.enabled = 1 AND c.postcode = o.postcode AND c.fulfillment = o.fulfillment
            WHERE o.vendor_id = #{vendorId} AND o.outlet_id = #{outletId}
              AND vp.access_mode = 'MANUAL_ONLY'
              AND vp.terms_url IS NOT NULL AND vp.terms_reviewed_at IS NOT NULL AND vp.terms_reviewed_by IS NOT NULL
              AND o.price_tax_basis = 'INCLUDES_GST'
              AND o.observed_timezone &lt;&gt; 'UNKNOWN'
              AND o.evidence_url IS NOT NULL AND BTRIM(o.evidence_url) &lt;&gt; ''
              AND (o.price_type = 'STANDARD' OR (
                o.promotion_terms IS NOT NULL AND BTRIM(o.promotion_terms) &lt;&gt; ''
                AND (o.promotion_starts_at IS NULL OR o.promotion_starts_at &lt;= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
                AND (o.promotion_ends_at IS NULL OR o.promotion_ends_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
              ))
              AND o.price_tax_basis = 'INCLUDES_GST'
              AND o.product_id IN
            <foreach collection="productIds" item="productId" open="(" separator="," close=")">
              #{productId}
            </foreach>
              AND ((o.review_status = 'VERIFIED'
                    AND o.match_review_status = 'PASS' AND o.price_review_status = 'PASS'
                    AND o.observed_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '14 days')
                   OR (#{includePending} = TRUE AND o.review_status = 'PENDING_REVIEW'))
            ORDER BY o.product_id, o.observed_at DESC
            </script>
            """)
    List<CompetitorPriceObservation> verifiedForProducts(@Param("vendorId") Long vendorId,
                                                          @Param("outletId") Long outletId,
                                                          @Param("productIds") List<Long> productIds,
                                                          @Param("includePending") boolean includePending);

    @Select("""
            SELECT EXISTS (SELECT 1 FROM competitor_price_observation
              WHERE id = #{id} AND vendor_id = #{vendorId} AND outlet_id = #{outletId}
                AND review_status = 'PENDING_REVIEW')
            """)
    boolean isPendingForOutlet(@Param("id") Long id, @Param("vendorId") Long vendorId,
                               @Param("outletId") Long outletId);

    @Select("SELECT created_by FROM competitor_price_observation WHERE id = #{id} AND vendor_id = #{vendorId} AND outlet_id = #{outletId}")
    Long observationCreator(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Update("""
            UPDATE competitor_price_observation
            SET review_status = #{status}, match_review_status = #{matchStatus},
                price_review_status = #{priceStatus}, review_note = #{note},
                verified_by = #{userId}, verified_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND vendor_id = #{vendorId} AND outlet_id = #{outletId}
               AND review_status = 'PENDING_REVIEW'
            """)
    int review(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
               @Param("userId") Long userId, @Param("status") String status,
               @Param("matchStatus") String matchStatus, @Param("priceStatus") String priceStatus,
               @Param("note") String note);

    @Insert("""
            INSERT INTO competitor_price_observation_review
              (observation_id, vendor_id, outlet_id, reviewed_by, overall_status,
               match_status, price_status, match_note, price_note, reviewed_at)
            VALUES (#{id}, #{vendorId}, #{outletId}, #{userId}, #{status},
                    #{matchStatus}, #{priceStatus}, #{matchNote}, #{priceNote}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
            """)
    int insertReviewAudit(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                          @Param("userId") Long userId, @Param("matchStatus") String matchStatus,
                          @Param("priceStatus") String priceStatus, @Param("matchNote") String matchNote,
                          @Param("priceNote") String priceNote);
}

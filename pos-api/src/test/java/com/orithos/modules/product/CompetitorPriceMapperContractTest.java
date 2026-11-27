package com.orithos.modules.product;

import com.orithos.modules.product.mapper.CompetitorPriceMapper;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.scripting.xmltags.XMLLanguageDriver;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.apache.ibatis.annotations.Insert;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CompetitorPriceMapperContractTest {
    @Test
    void manualReviewDoesNotManufactureMatchConfidence() throws Exception {
        String update = CompetitorPriceMapper.class
                .getMethod("review", Long.class, Long.class, Long.class, Long.class,
                        String.class, String.class, String.class, String.class)
                .getAnnotation(Update.class).value()[0];

        assertTrue(update.contains("review_status = #{status}"));
        assertTrue(update.contains("match_review_status = #{matchStatus}"));
        assertTrue(update.contains("price_review_status = #{priceStatus}"));
        assertFalse(update.contains("match_confidence"));
        assertFalse(update.contains("GREATEST"));
    }

    @Test
    void referenceResultsRequireBothIndependentReviewDecisions() throws Exception {
        String select = String.join(" ", CompetitorPriceMapper.class
                .getMethod("verifiedForProducts", Long.class, Long.class, java.util.List.class, boolean.class)
                .getAnnotation(Select.class).value());

        assertTrue(select.contains("o.match_review_status = 'PASS'"));
        assertTrue(select.contains("o.price_review_status = 'PASS'"));
        assertTrue(CompetitorPriceMapper.class.getMethod("insertReviewAudit", Long.class, Long.class,
                Long.class, Long.class, String.class, String.class, String.class, String.class)
                .isAnnotationPresent(Insert.class));
    }

    @Test
    void onlyFreshVerifiedObservationsEnterReferenceResults() throws Exception {
        String select = String.join(" ", CompetitorPriceMapper.class
                .getMethod("verifiedForProducts", Long.class, Long.class, java.util.List.class, boolean.class)
                .getAnnotation(Select.class).value());

        assertTrue(select.contains("o.review_status = 'VERIFIED'"));
        assertTrue(select.contains("(CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '14 days'"));
        assertFalse(select.contains("o.match_confidence >= 0.90"));
        assertTrue(select.contains("vp.terms_url IS NOT NULL"));
        assertTrue(select.contains("vp.terms_reviewed_at IS NOT NULL"));
        assertTrue(select.contains("vp.terms_reviewed_by IS NOT NULL"));
        assertTrue(select.contains("vp.access_mode = 'MANUAL_ONLY'"));
        assertTrue(select.contains("o.price_tax_basis = 'INCLUDES_GST'"));
        assertTrue(select.contains("o.evidence_url IS NOT NULL"));
        assertTrue(select.contains("o.promotion_ends_at IS NULL OR o.promotion_ends_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')"));
    }

    @Test
    void unreviewedSourcesCannotBeEnabledOrUsedForManualEntry() throws Exception {
        String sourceMode = String.join(" ", CompetitorPriceMapper.class
                .getMethod("sourceAccessMode", Long.class, Long.class)
                .getAnnotation(Select.class).value());
        String savePreference = String.join(" ", CompetitorPriceMapper.class
                .getMethod("savePreference", Long.class, Long.class, Long.class, String.class, String.class, boolean.class, int.class)
                .getAnnotation(Insert.class).value());

        assertTrue(sourceMode.contains("COALESCE(vp.access_mode, 'UNREVIEWED')"));
        assertTrue(sourceMode.contains("vp.vendor_id = #{vendorId}"));
        assertTrue(savePreference.contains("#{enabled} = FALSE OR EXISTS"));
        assertTrue(savePreference.contains("terms_reviewed_at IS NOT NULL"));
        assertTrue(savePreference.contains("terms_reviewed_by IS NOT NULL"));
    }

    @Test
    void sourceApprovalIsVendorScopedAndRequiredByCaptureAndDisplay() throws Exception {
        String sourceList = String.join(" ", CompetitorPriceMapper.class
                .getMethod("listSources", Long.class, Long.class).getAnnotation(Select.class).value());
        String permissionWrite = String.join(" ", CompetitorPriceMapper.class
                .getMethod("saveSourcePermission", Long.class, Long.class, String.class, String.class, Long.class,
                        String.class, String.class, String.class, String.class)
                .getAnnotation(Insert.class).value());
        String capture = String.join(" ", CompetitorPriceMapper.class
                .getMethod("insertObservation", Long.class, Long.class, Long.class, CompetitorPriceObservation.class)
                .getAnnotation(Insert.class).value());
        String display = String.join(" ", CompetitorPriceMapper.class
                .getMethod("verifiedForProducts", Long.class, Long.class, java.util.List.class, boolean.class)
                .getAnnotation(Select.class).value());

        assertTrue(sourceList.contains("vp.vendor_id = #{vendorId}"));
        assertTrue(permissionWrite.contains("ON CONFLICT (vendor_id, source_id)"));
        assertTrue(permissionWrite.contains("INSERT INTO vendor_competitor_source_permission_audit"));
        assertTrue(permissionWrite.contains("FROM saved"));
        assertTrue(capture.contains("vp.vendor_id = #{vendorId}"));
        assertTrue(capture.contains("vp.access_mode = 'MANUAL_ONLY'"));
        assertTrue(display.contains("vp.vendor_id = o.vendor_id"));
        assertTrue(display.contains("vp.access_mode = 'MANUAL_ONLY'"));
    }

    @Test
    void priceReferencesRetainManufacturerVersusRetailerSourceType() throws Exception {
        String sourceList = String.join(" ", CompetitorPriceMapper.class
                .getMethod("listSources", Long.class, Long.class).getAnnotation(Select.class).value());
        String observationList = String.join(" ", CompetitorPriceMapper.class
                .getMethod("verifiedForProducts", Long.class, Long.class, java.util.List.class, boolean.class)
                .getAnnotation(Select.class).value());
        String migration = java.nio.file.Files.readString(java.nio.file.Path.of(
                "src/main/resources/db/migration_competitor_price_observations.sql"));

        assertTrue(sourceList.contains("s.source_type AS sourceType"));
        assertTrue(observationList.contains("s.source_type AS sourceType"));
        assertTrue(migration.contains("source_type IN ('MANUFACTURER', 'RETAILER')"));
    }

    @Test
    void verifiedProductQueryIsValidMyBatisXmlScript() throws Exception {
        String script = String.join(" ", CompetitorPriceMapper.class
                .getMethod("verifiedForProducts", Long.class, Long.class, java.util.List.class, boolean.class)
                .getAnnotation(Select.class).value());

        assertDoesNotThrow(() -> new XMLLanguageDriver().createSqlSource(new Configuration(), script, java.util.Map.class));
    }
}

package com.orithos.modules.ai.report;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AiReportAuditMapper {

    @Insert("""
            INSERT INTO ai_report_audit
              (vendor_id, user_id, outlet_id, outlet_ids, question, sql_text, path,
               allowed, reject_reason, row_count, latency_ms, estimated_tokens)
            VALUES
              (#{vendorId}, #{userId}, #{outletId}, #{outletIds}, #{question}, #{sqlText}, #{path},
               CASE WHEN #{allowed} THEN 1 ELSE 0 END, #{rejectReason}, #{rowCount}, #{latencyMs}, #{estimatedTokens})
            """)
    int insert(@Param("vendorId") long vendorId,
               @Param("userId") long userId,
               @Param("outletId") Long outletId,
               @Param("outletIds") String outletIds,
               @Param("question") String question,
               @Param("sqlText") String sqlText,
               @Param("path") String path,
               @Param("allowed") boolean allowed,
               @Param("rejectReason") String rejectReason,
               @Param("rowCount") Integer rowCount,
               @Param("latencyMs") Integer latencyMs,
               @Param("estimatedTokens") Integer estimatedTokens);

    @Select("""
            SELECT COUNT(*) AS requests,
                   COALESCE(SUM(CASE WHEN allowed IS TRUE THEN 1 ELSE 0 END), 0) AS allowed,
                   COALESCE(SUM(CASE WHEN allowed IS FALSE THEN 1 ELSE 0 END), 0) AS rejected,
                   COALESCE(AVG(latency_ms), 0) AS averageLatencyMs,
                   COALESCE(SUM(COALESCE(estimated_tokens, CEIL((COALESCE(CHAR_LENGTH(question), 0) +
                                     COALESCE(CHAR_LENGTH(sql_text), 0)) / 4.0))), 0) AS estimatedTokens
            FROM ai_report_audit
            WHERE vendor_id = #{vendorId} AND created_at >= #{since}
            """)
    AiReportMetricsRow summarize(@Param("vendorId") long vendorId,
                                 @Param("since") LocalDateTime since);

    @Select("""
            SELECT COALESCE(path, 'unknown') AS path,
                   COUNT(*) AS requests,
                   COALESCE(SUM(CASE WHEN allowed IS TRUE THEN 1 ELSE 0 END), 0) AS allowed,
                   COALESCE(SUM(CASE WHEN allowed IS FALSE THEN 1 ELSE 0 END), 0) AS rejected,
                   COALESCE(AVG(latency_ms), 0) AS averageLatencyMs,
                   COALESCE(SUM(COALESCE(estimated_tokens, CEIL((COALESCE(CHAR_LENGTH(question), 0) +
                                     COALESCE(CHAR_LENGTH(sql_text), 0)) / 4.0))), 0) AS estimatedTokens
            FROM ai_report_audit
            WHERE vendor_id = #{vendorId} AND created_at >= #{since}
            GROUP BY COALESCE(path, 'unknown')
            ORDER BY requests DESC, path ASC
            """)
    List<AiReportMetricsPathRow> summarizeByPath(@Param("vendorId") long vendorId,
                                                 @Param("since") LocalDateTime since);

    @Select("""
            SELECT latency_ms
            FROM ai_report_audit
            WHERE vendor_id = #{vendorId}
              AND created_at >= #{since}
              AND latency_ms IS NOT NULL
            ORDER BY latency_ms ASC
            """)
    List<Integer> latencyValues(@Param("vendorId") long vendorId,
                                @Param("since") LocalDateTime since);

    @Select("""
            SELECT COALESCE(path, 'unknown') AS path, latency_ms
            FROM ai_report_audit
            WHERE vendor_id = #{vendorId}
              AND created_at >= #{since}
              AND latency_ms IS NOT NULL
            ORDER BY path ASC, latency_ms ASC
            """)
    List<AiReportMetricsLatencyRow> latencyValuesByPath(@Param("vendorId") long vendorId,
                                                        @Param("since") LocalDateTime since);

    @Select("""
            SELECT vendor_id AS vendorId,
                   COUNT(*) AS requests,
                   COALESCE(SUM(CASE WHEN allowed IS TRUE THEN 1 ELSE 0 END), 0) AS allowed,
                   COALESCE(SUM(CASE WHEN allowed IS FALSE THEN 1 ELSE 0 END), 0) AS rejected,
                   COALESCE(AVG(latency_ms), 0) AS averageLatencyMs,
                   COALESCE(SUM(COALESCE(estimated_tokens, CEIL((COALESCE(CHAR_LENGTH(question), 0) +
                                     COALESCE(CHAR_LENGTH(sql_text), 0)) / 4.0))), 0) AS estimatedTokens,
                   MAX(created_at) AS lastSeenAt
            FROM ai_report_audit
            WHERE created_at >= #{since}
            GROUP BY vendor_id
            ORDER BY requests DESC, vendor_id ASC
            """)
    List<AiPlatformVendorMetricsRow> summarizeByVendor(@Param("since") LocalDateTime since);

}

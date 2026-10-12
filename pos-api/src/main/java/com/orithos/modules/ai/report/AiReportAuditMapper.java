package com.orithos.modules.ai.report;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AiReportAuditMapper {

    @Insert("""
            INSERT INTO ai_report_audit
              (vendor_id, user_id, outlet_id, outlet_ids, question, sql_text, path,
               allowed, reject_reason, row_count, latency_ms)
            VALUES
              (#{vendorId}, #{userId}, #{outletId}, #{outletIds}, #{question}, #{sqlText}, #{path},
               #{allowed}, #{rejectReason}, #{rowCount}, #{latencyMs})
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
               @Param("latencyMs") Integer latencyMs);
}

package com.orithos.modules.ai.report;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AiReportSnapshotMapper {

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO ai_report_snapshot
              (vendor_id, user_id, outlet_id, intent, question, title, result_json)
            VALUES
              (#{vendorId}, #{userId}, #{outletId}, #{intent}, #{question}, #{title}, #{resultJson})
            """)
    int insert(AiReportSnapshot row);

    @Select("""
            SELECT id, vendor_id AS vendorId, user_id AS userId, outlet_id AS outletId,
                   intent, question, title, result_json AS resultJson, created_at AS createdAt
            FROM ai_report_snapshot
            WHERE id = #{id} AND vendor_id = #{vendorId} AND user_id = #{userId}
            """)
    AiReportSnapshot findByIdAndOwner(@Param("id") long id,
                                      @Param("vendorId") long vendorId,
                                      @Param("userId") long userId);
}

package com.orithos.modules.ai.managerbrief;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;

@Mapper
public interface AiManagerDailyBriefMapper {
    @Select("""
            SELECT id, vendor_id AS vendorId, outlet_id AS outletId, business_date AS businessDate,
                   revision, timezone, data_as_of AS dataAsOf, data_quality AS dataQuality,
                   payload_json AS payloadJson, model_status AS modelStatus, created_at AS createdAt
            FROM ai_manager_daily_brief
            WHERE vendor_id = #{vendorId} AND outlet_id = #{outletId} AND business_date = #{businessDate}
            ORDER BY revision DESC LIMIT 1
            """)
    AiManagerDailyBriefRow findLatest(@Param("vendorId") long vendorId,
                                     @Param("outletId") long outletId,
                                     @Param("businessDate") LocalDate businessDate);

    @Select("SELECT COALESCE(MAX(revision), 0) FROM ai_manager_daily_brief WHERE vendor_id = #{vendorId} AND outlet_id = #{outletId} AND business_date = #{businessDate}")
    int maxRevision(@Param("vendorId") long vendorId, @Param("outletId") long outletId,
                    @Param("businessDate") LocalDate businessDate);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO ai_manager_daily_brief
              (vendor_id, outlet_id, business_date, revision, timezone, data_as_of,
               data_quality, payload_json, model_status)
            VALUES (#{vendorId}, #{outletId}, #{businessDate}, #{revision}, #{timezone},
                    #{dataAsOf}, #{dataQuality}, #{payloadJson}, #{modelStatus})
            """)
    int insert(AiManagerDailyBriefRow row);

    @Insert("""
            INSERT INTO ai_manager_daily_brief_event
              (brief_id, vendor_id, outlet_id, user_id, card_id, event_type)
            VALUES (#{briefId}, #{vendorId}, #{outletId}, #{userId}, #{cardId}, #{eventType})
            """)
    int insertEvent(@Param("briefId") long briefId, @Param("vendorId") long vendorId,
                    @Param("outletId") long outletId, @Param("userId") long userId,
                    @Param("cardId") String cardId, @Param("eventType") String eventType);

    @Select("SELECT id FROM ai_manager_daily_brief WHERE id = #{id} AND vendor_id = #{vendorId} AND outlet_id = #{outletId}")
    Long findOwned(@Param("id") long id, @Param("vendorId") long vendorId, @Param("outletId") long outletId);
}

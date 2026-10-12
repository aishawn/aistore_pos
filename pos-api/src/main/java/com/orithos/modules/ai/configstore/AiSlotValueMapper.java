package com.orithos.modules.ai.configstore;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AiSlotValueMapper {

    @Select("SELECT * FROM ai_slot_value ORDER BY slot_code ASC, sort_order ASC, id ASC")
    List<AiSlotValue> findAll();

    @Select("SELECT * FROM ai_slot_value WHERE enabled = 1 ORDER BY slot_code ASC, sort_order ASC, id ASC")
    List<AiSlotValue> findEnabled();

    @Select("SELECT * FROM ai_slot_value WHERE slot_code = #{slotCode} AND enabled = 1 "
            + "ORDER BY sort_order ASC, id ASC")
    List<AiSlotValue> findEnabledBySlot(String slotCode);

    @Select("SELECT * FROM ai_slot_value WHERE id = #{id}")
    AiSlotValue findById(Long id);

    @Select("SELECT * FROM ai_slot_value WHERE slot_code = #{slotCode} AND value_key = #{valueKey} LIMIT 1")
    AiSlotValue findBySlotAndKey(@Param("slotCode") String slotCode, @Param("valueKey") String valueKey);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ai_slot_value (slot_code, value_key, value, label, enabled, sort_order) "
            + "VALUES (#{slotCode}, #{valueKey}, #{value}, #{label}, #{enabled}, #{sortOrder})")
    int insert(AiSlotValue row);

    @Update("UPDATE ai_slot_value SET slot_code=#{slotCode}, value_key=#{valueKey}, value=#{value}, "
            + "label=#{label}, enabled=#{enabled}, sort_order=#{sortOrder} WHERE id=#{id}")
    int update(AiSlotValue row);

    @Delete("DELETE FROM ai_slot_value WHERE id = #{id}")
    int delete(Long id);

    @Select("SELECT COUNT(*) FROM ai_slot_value")
    long count();
}

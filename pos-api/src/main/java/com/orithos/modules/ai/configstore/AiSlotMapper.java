package com.orithos.modules.ai.configstore;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AiSlotMapper {

    @Select("SELECT * FROM ai_slot ORDER BY sort_order ASC, id ASC")
    List<AiSlot> findAll();

    @Select("SELECT * FROM ai_slot WHERE enabled = 1 ORDER BY sort_order ASC, id ASC")
    List<AiSlot> findEnabled();

    @Select("SELECT * FROM ai_slot WHERE id = #{id}")
    AiSlot findById(Long id);

    @Select("SELECT * FROM ai_slot WHERE code = #{code}")
    AiSlot findByCode(String code);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ai_slot (code, name, description, value_type, max_length, enabled, sort_order) "
            + "VALUES (#{code}, #{name}, #{description}, #{valueType}, #{maxLength}, #{enabled}, #{sortOrder})")
    int insert(AiSlot row);

    @Update("UPDATE ai_slot SET code=#{code}, name=#{name}, description=#{description}, value_type=#{valueType}, "
            + "max_length=#{maxLength}, enabled=#{enabled}, sort_order=#{sortOrder} WHERE id=#{id}")
    int update(AiSlot row);

    @Delete("DELETE FROM ai_slot WHERE id = #{id}")
    int delete(Long id);

    @Select("SELECT COUNT(*) FROM ai_slot")
    long count();
}

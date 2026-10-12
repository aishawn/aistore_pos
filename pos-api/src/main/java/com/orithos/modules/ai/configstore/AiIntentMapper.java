package com.orithos.modules.ai.configstore;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AiIntentMapper {

    @Select("SELECT * FROM ai_intent ORDER BY sort_order ASC, id ASC")
    List<AiIntent> findAll();

    @Select("SELECT * FROM ai_intent WHERE enabled = 1 ORDER BY sort_order ASC, id ASC")
    List<AiIntent> findEnabled();

    @Select("SELECT * FROM ai_intent WHERE id = #{id}")
    AiIntent findById(Long id);

    @Select("SELECT * FROM ai_intent WHERE code = #{code}")
    AiIntent findByCode(String code);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ai_intent (code, name, description, prompt_hint, default_panel, default_view, enabled, sort_order) "
            + "VALUES (#{code}, #{name}, #{description}, #{promptHint}, #{defaultPanel}, #{defaultView}, "
            + "#{enabled}, #{sortOrder})")
    int insert(AiIntent row);

    @Update("UPDATE ai_intent SET code=#{code}, name=#{name}, description=#{description}, prompt_hint=#{promptHint}, "
            + "default_panel=#{defaultPanel}, default_view=#{defaultView}, enabled=#{enabled}, sort_order=#{sortOrder} "
            + "WHERE id=#{id}")
    int update(AiIntent row);

    @Delete("DELETE FROM ai_intent WHERE id = #{id}")
    int delete(Long id);

    @Select("SELECT COUNT(*) FROM ai_intent")
    long count();
}

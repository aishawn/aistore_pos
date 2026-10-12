package com.orithos.modules.ai.configstore;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface AiPromptMapper {

    @Select("SELECT * FROM ai_prompt ORDER BY id ASC")
    List<AiPrompt> findAll();

    @Select("SELECT * FROM ai_prompt WHERE code = #{code} AND enabled = 1 LIMIT 1")
    AiPrompt findEnabledByCode(String code);

    @Select("SELECT * FROM ai_prompt WHERE id = #{id}")
    AiPrompt findById(Long id);

    @Select("SELECT * FROM ai_prompt WHERE code = #{code}")
    AiPrompt findByCode(String code);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ai_prompt (code, name, content, enabled) VALUES (#{code}, #{name}, #{content}, #{enabled})")
    int insert(AiPrompt row);

    @Update("UPDATE ai_prompt SET code=#{code}, name=#{name}, content=#{content}, enabled=#{enabled} WHERE id=#{id}")
    int update(AiPrompt row);

    @Delete("DELETE FROM ai_prompt WHERE id = #{id}")
    int delete(Long id);

    @Select("SELECT COUNT(*) FROM ai_prompt")
    long count();
}

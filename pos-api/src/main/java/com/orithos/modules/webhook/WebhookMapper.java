package com.orithos.modules.webhook;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface WebhookMapper {

    @Select("SELECT * FROM webhook ORDER BY created_at DESC, id DESC")
    List<Webhook> findAll();

    @Select("SELECT * FROM webhook WHERE id = #{id}")
    Webhook findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO webhook (name, url, events, signature_key, integration_id, active) "
            + "VALUES (#{name}, #{url}, #{events}, #{signatureKey}, #{integrationId}, #{active})")
    int insert(Webhook w);

    @Update("UPDATE webhook SET name=#{name}, url=#{url}, events=#{events}, active=#{active} WHERE id=#{id}")
    int update(Webhook w);

    @Delete("DELETE FROM webhook WHERE id = #{id}")
    int delete(Long id);

    @Update("UPDATE webhook SET active=1 WHERE id=#{id}")
    int activate(Long id);

    @Update("UPDATE webhook SET active=0 WHERE id=#{id}")
    int deactivate(Long id);

    @Update("UPDATE webhook SET signature_key=#{key} WHERE id=#{id}")
    int updateSignature(@Param("id") Long id, @Param("key") String key);
}

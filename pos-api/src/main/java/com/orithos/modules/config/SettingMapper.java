package com.orithos.modules.config;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SettingMapper {

    @Select("<script>SELECT * FROM settings"
            + "<where>"
            + "<if test='scopeType != null'> AND scope_type = #{scopeType}</if>"
            + "<if test='scopeId != null'> AND scope_id = #{scopeId}</if>"
            + "</where>"
            + " ORDER BY scope_type, name</script>")
    List<Setting> findAll(@Param("scopeType") String scopeType, @Param("scopeId") Long scopeId);

    @Select("<script>SELECT * FROM settings WHERE scope_type = #{scopeType} AND name = #{name}"
            + "<choose>"
            + "<when test='scopeId == null'> AND scope_id IS NULL</when>"
            + "<otherwise> AND scope_id = #{scopeId}</otherwise>"
            + "</choose>"
            + " LIMIT 1</script>")
    Setting findByName(@Param("scopeType") String scopeType,
                       @Param("scopeId") Long scopeId,
                       @Param("name") String name);

    @Insert("INSERT INTO settings (scope_type, scope_id, name, value, datatype) "
            + "VALUES (#{scopeType}, #{scopeId}, #{name}, #{value}, #{datatype}) "
            + "ON CONFLICT (scope_type, scope_id, name) DO UPDATE SET value = EXCLUDED.value, datatype = EXCLUDED.datatype, updated_at = CURRENT_TIMESTAMP")
    int upsert(Setting s);
}

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

    @Insert("INSERT INTO settings (scope_type, scope_id, name, value, datatype) "
            + "VALUES (#{scopeType}, #{scopeId}, #{name}, #{value}, #{datatype}) "
            + "ON CONFLICT (scope_type, scope_id, name) DO UPDATE SET value = EXCLUDED.value, datatype = EXCLUDED.datatype")
    int upsert(Setting s);
}

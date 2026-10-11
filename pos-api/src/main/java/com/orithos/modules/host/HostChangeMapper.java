package com.orithos.modules.host;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface HostChangeMapper {

    @Select("SELECT * FROM host_change WHERE (#{hostConnectionId} IS NULL OR host_connection_id = #{hostConnectionId}) "
            + "ORDER BY created_at DESC")
    List<HostChange> findAll(@Param("hostConnectionId") Long hostConnectionId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO host_change (host_connection_id, type, status, data) "
            + "VALUES (#{hostConnectionId}, #{type}, #{status}, #{data})")
    int insert(HostChange c);

    @Update("UPDATE host_change SET status=#{status} WHERE id=#{id}")
    int updateStatus(@Param("id") Long id, @Param("status") String status);
}

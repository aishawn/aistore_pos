package com.orithos.modules.host;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface HostIdentifierMapper {

    @Select("SELECT * FROM host_identifier ORDER BY id DESC")
    List<HostIdentifier> findAll();

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO host_identifier (host_connection_id, local_id, host_id, type) "
            + "VALUES (#{hostConnectionId}, #{localId}, #{hostId}, #{type})")
    int insert(HostIdentifier i);
}

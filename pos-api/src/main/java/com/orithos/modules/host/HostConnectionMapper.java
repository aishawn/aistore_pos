package com.orithos.modules.host;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface HostConnectionMapper {

    @Select("SELECT * FROM host_connection ORDER BY created_at DESC, id DESC")
    List<HostConnection> findAll();

    @Select("SELECT * FROM host_connection WHERE id = #{id}")
    HostConnection findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO host_connection (type, outlet_id, price_set_id, user_id, metadata, settings, credentials) "
            + "VALUES (#{type}, #{outletId}, #{priceSetId}, #{userId}, #{metadata}, #{settings}, #{credentials})")
    int insert(HostConnection h);

    @Update("UPDATE host_connection SET type=#{type}, outlet_id=#{outletId}, price_set_id=#{priceSetId}, "
            + "user_id=#{userId}, metadata=#{metadata}, settings=#{settings}, credentials=#{credentials} WHERE id=#{id}")
    int update(HostConnection h);

    @Delete("DELETE FROM host_connection WHERE id = #{id}")
    int delete(Long id);
}

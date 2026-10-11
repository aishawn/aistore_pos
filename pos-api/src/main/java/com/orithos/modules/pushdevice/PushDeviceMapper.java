package com.orithos.modules.pushdevice;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface PushDeviceMapper {

    @Select("SELECT * FROM push_device ORDER BY created_at DESC, id DESC")
    List<PushDevice> findAll();

    @Select("SELECT * FROM push_device WHERE id = #{id}")
    PushDevice findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO push_device (name, endpoint, notifications) "
            + "VALUES (#{name}, #{endpoint}, #{notifications})")
    int insert(PushDevice d);

    @Update("UPDATE push_device SET name=#{name}, endpoint=#{endpoint}, notifications=#{notifications} WHERE id=#{id}")
    int update(PushDevice d);

    @Delete("DELETE FROM push_device WHERE id = #{id}")
    int delete(Long id);
}

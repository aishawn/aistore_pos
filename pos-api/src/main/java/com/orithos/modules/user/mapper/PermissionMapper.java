package com.orithos.modules.user.mapper;

import com.orithos.modules.user.entity.Permission;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface PermissionMapper {

    @Select("SELECT * FROM permission ORDER BY section, name")
    List<Permission> findAll();
}

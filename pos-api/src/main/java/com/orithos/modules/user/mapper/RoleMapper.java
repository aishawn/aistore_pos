package com.orithos.modules.user.mapper;

import com.orithos.modules.user.entity.Permission;
import com.orithos.modules.user.entity.Role;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface RoleMapper {

    @Select("SELECT * FROM role WHERE id = #{id}")
    Role findById(Long id);

    @Select("SELECT * FROM role ORDER BY id DESC")
    List<Role> findAll();

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO role (name, managed_id) VALUES (#{name}, #{managedId})")
    int insert(Role r);

    @Update("UPDATE role SET name=#{name} WHERE id=#{id}")
    int update(Role r);

    @Delete("DELETE FROM role WHERE id=#{id}")
    int delete(Long id);

    /** Permissions granted to a role via role_permission. */
    @Select("""
        SELECT p.* FROM permission p
        JOIN role_permission rp ON rp.permission_id = p.id
        WHERE rp.role_id = #{roleId}
        """)
    List<Permission> permissionsOfRole(Long roleId);

    @Insert("INSERT IGNORE INTO role_permission (role_id, permission_id) VALUES (#{roleId}, #{permissionId})")
    int addPermission(@Param("roleId") Long roleId, @Param("permissionId") int permissionId);

    @Delete("DELETE FROM role_permission WHERE role_id = #{roleId}")
    int clearPermissions(Long roleId);
}

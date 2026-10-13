package com.orithos.modules.user.mapper;

import com.orithos.modules.user.entity.User;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface UserMapper {

    @Select("SELECT * FROM app_user WHERE username = #{username} AND deleted_at IS NULL")
    User findByUsername(String username);

    @Select("SELECT * FROM app_user WHERE email = #{email} AND deleted_at IS NULL LIMIT 1")
    User findByEmail(String email);

    @Select("SELECT * FROM app_user WHERE id = #{id}")
    User findById(Long id);

    @Select("SELECT * FROM app_user WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC")
    List<User> findAll();

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO app_user (name, username, password_hash, email, phone, image,
                              role_id, is_admin, is_api_user, dark_mode, pending_password_reset, outlet_id)
        VALUES (#{name}, #{username}, #{passwordHash}, #{email}, #{phone}, #{image},
                #{roleId}, #{isAdmin}, #{isApiUser}, #{darkMode}, #{pendingPasswordReset}, #{outletId})
        """)
    int insert(User u);

    @Update("""
        UPDATE app_user SET name=#{name}, email=#{email}, phone=#{phone}, image=#{image},
               role_id=#{roleId}, dark_mode=#{darkMode}, pending_password_reset=#{pendingPasswordReset}
        WHERE id=#{id}
        """)
    int update(User u);

    @Update("UPDATE app_user SET password_hash=#{hash}, pending_password_reset=0 WHERE id=#{id} AND deleted_at IS NULL")
    int updatePassword(@Param("id") Long id, @Param("hash") String hash);

    @Update("UPDATE app_user SET dashboard=#{dashboard} WHERE id=#{id}")
    int updateDashboard(@Param("id") Long id, @Param("dashboard") String dashboard);

    @Update("UPDATE app_user SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Select("SELECT COUNT(*) FROM app_user WHERE deleted_at IS NULL")
    long count();
}

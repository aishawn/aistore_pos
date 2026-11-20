package com.orithos.modules.user.mapper;

import com.orithos.modules.user.entity.User;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface UserMapper {

    @Select("SELECT * FROM app_user WHERE username = #{username} AND deleted_at IS NULL")
    User findByUsername(String username);

    @Select("""
            SELECT * FROM app_user
            WHERE vendor_id = #{vendorId} AND username = #{username} AND deleted_at IS NULL
            """)
    User findByVendorAndUsername(@Param("vendorId") Long vendorId, @Param("username") String username);

    @Select("""
            SELECT id, name, username FROM app_user
            WHERE vendor_id = #{vendorId} AND deleted_at IS NULL
              AND outlet_id IS NOT NULL AND COALESCE(is_api_user, 0) = 0
            ORDER BY is_admin DESC, name ASC, id ASC
            """)
    @ConstructorArgs({
            @Arg(column = "id", javaType = Long.class, id = true),
            @Arg(column = "name", javaType = String.class),
            @Arg(column = "username", javaType = String.class)
    })
    List<LoginStaffOption> findLoginOptionsByVendor(@Param("vendorId") Long vendorId);

    @Select("SELECT * FROM app_user WHERE email = #{email} AND deleted_at IS NULL LIMIT 1")
    User findByEmail(String email);

    @Select("SELECT * FROM app_user WHERE id = #{id}")
    User findById(Long id);

    @Select("SELECT * FROM app_user WHERE id = #{id} AND deleted_at IS NULL")
    User findActiveById(Long id);

    @Select("SELECT * FROM app_user WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC")
    List<User> findAll();

    @Select("""
            SELECT * FROM app_user
            WHERE vendor_id = #{vendorId} AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            """)
    List<User> findAllByVendor(@Param("vendorId") Long vendorId);

    @Select("""
            SELECT * FROM app_user
            WHERE vendor_id = #{vendorId} AND deleted_at IS NULL
            ORDER BY is_admin DESC, id ASC
            LIMIT 1
            """)
    User findPrimaryByVendor(@Param("vendorId") Long vendorId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO app_user (vendor_id, name, username, password_hash, email, phone, image,
                              role_id, is_admin, is_api_user, dark_mode, pending_password_reset, outlet_id)
        VALUES (#{vendorId}, #{name}, #{username}, #{passwordHash}, #{email}, #{phone}, #{image},
                #{roleId}, CASE WHEN #{isAdmin} THEN 1 ELSE 0 END,
                CASE WHEN #{isApiUser} THEN 1 ELSE 0 END, #{darkMode},
                CASE WHEN #{pendingPasswordReset} THEN 1 ELSE 0 END, #{outletId})
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

package com.orithos.modules.utility;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface VendorConnectionMapper {

    @Select("SELECT * FROM vendor_connection ORDER BY id DESC")
    List<VendorConnection> findAll();

    @Select("SELECT * FROM vendor_connection WHERE id = #{id}")
    VendorConnection findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO vendor_connection (name, sender_code, customer_id) "
            + "VALUES (#{name}, #{senderCode}, #{customerId})")
    int insert(VendorConnection v);

    @Update("UPDATE vendor_connection SET name=#{name}, sender_code=#{senderCode}, customer_id=#{customerId} WHERE id=#{id}")
    int update(VendorConnection v);

    @Delete("DELETE FROM vendor_connection WHERE id = #{id}")
    int delete(Long id);
}

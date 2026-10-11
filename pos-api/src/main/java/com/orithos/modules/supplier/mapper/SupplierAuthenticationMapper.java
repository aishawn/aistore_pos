package com.orithos.modules.supplier.mapper;

import com.orithos.modules.supplier.SupplierAuthentication;
import org.apache.ibatis.annotations.*;

@Mapper
public interface SupplierAuthenticationMapper {

    @Select("SELECT supplier_id, account_number, username, password_hash, additional_auth "
            + "FROM supplier_authentication WHERE supplier_id = #{supplierId}")
    SupplierAuthentication findBySupplierId(Long supplierId);

    @Insert("""
        INSERT INTO supplier_authentication (supplier_id, account_number, username, password_hash, additional_auth)
        VALUES (#{supplierId}, #{accountNumber}, #{username}, #{passwordHash}, #{additionalAuth})
        """)
    int insert(SupplierAuthentication auth);

    @Update("""
        UPDATE supplier_authentication SET account_number=#{accountNumber}, username=#{username},
               password_hash=#{passwordHash}, additional_auth=#{additionalAuth}
        WHERE supplier_id=#{supplierId}
        """)
    int update(SupplierAuthentication auth);

    @Delete("DELETE FROM supplier_authentication WHERE supplier_id = #{supplierId}")
    int deleteBySupplierId(Long supplierId);
}

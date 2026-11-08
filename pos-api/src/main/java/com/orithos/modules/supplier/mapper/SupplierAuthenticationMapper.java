package com.orithos.modules.supplier.mapper;

import com.orithos.modules.supplier.SupplierAuthentication;
import org.apache.ibatis.annotations.*;

@Mapper
public interface SupplierAuthenticationMapper {

    @Select("SELECT supplier_id, outlet_id, account_number, username, password_hash, additional_auth "
            + "FROM supplier_authentication WHERE supplier_id = #{supplierId} AND outlet_id = #{outletId}")
    SupplierAuthentication findBySupplierId(@Param("supplierId") Long supplierId,
                                             @Param("outletId") Long outletId);

    @Insert("""
        INSERT INTO supplier_authentication (supplier_id, outlet_id, account_number, username, password_hash, additional_auth)
        VALUES (#{supplierId}, #{outletId}, #{accountNumber}, #{username}, #{passwordHash}, #{additionalAuth})
        """)
    int insert(SupplierAuthentication auth);

    @Update("""
        UPDATE supplier_authentication SET outlet_id=#{outletId}, account_number=#{accountNumber}, username=#{username},
               password_hash=#{passwordHash}, additional_auth=#{additionalAuth}
        WHERE supplier_id=#{supplierId} AND outlet_id=#{outletId}
        """)
    int update(SupplierAuthentication auth);

    @Delete("DELETE FROM supplier_authentication WHERE supplier_id = #{supplierId} AND outlet_id = #{outletId}")
    int deleteBySupplierId(@Param("supplierId") Long supplierId, @Param("outletId") Long outletId);
}

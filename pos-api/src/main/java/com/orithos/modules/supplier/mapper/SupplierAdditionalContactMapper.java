package com.orithos.modules.supplier.mapper;

import com.orithos.modules.supplier.SupplierAdditionalContact;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SupplierAdditionalContactMapper {

    @Select("""
        SELECT id, supplier_id, outlet_id, name, email, phone, sort_order
        FROM supplier_additional_contact
        WHERE supplier_id = #{supplierId} AND outlet_id = #{outletId}
        ORDER BY sort_order, id
        """)
    List<SupplierAdditionalContact> findBySupplierId(@Param("supplierId") Long supplierId,
                                                     @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO supplier_additional_contact (supplier_id, outlet_id, name, email, phone, sort_order)
        VALUES (#{supplierId}, #{outletId}, #{name}, #{email}, #{phone}, #{sortOrder})
        """)
    int insert(SupplierAdditionalContact contact);

    @Delete("DELETE FROM supplier_additional_contact WHERE supplier_id = #{supplierId} AND outlet_id = #{outletId}")
    int deleteBySupplierId(@Param("supplierId") Long supplierId, @Param("outletId") Long outletId);
}

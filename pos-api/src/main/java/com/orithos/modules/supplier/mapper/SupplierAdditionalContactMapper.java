package com.orithos.modules.supplier.mapper;

import com.orithos.modules.supplier.SupplierAdditionalContact;
import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SupplierAdditionalContactMapper {

    @Select("""
        SELECT id, supplier_id, name, email, phone, sort_order
        FROM supplier_additional_contact
        WHERE supplier_id = #{supplierId}
        ORDER BY sort_order, id
        """)
    List<SupplierAdditionalContact> findBySupplierId(Long supplierId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO supplier_additional_contact (supplier_id, name, email, phone, sort_order)
        VALUES (#{supplierId}, #{name}, #{email}, #{phone}, #{sortOrder})
        """)
    int insert(SupplierAdditionalContact contact);

    @Delete("DELETE FROM supplier_additional_contact WHERE supplier_id = #{supplierId}")
    int deleteBySupplierId(Long supplierId);
}

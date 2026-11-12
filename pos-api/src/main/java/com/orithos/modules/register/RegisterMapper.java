package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface RegisterMapper {

    @Select("SELECT r.* FROM register r JOIN outlet o ON o.id = r.outlet_id "
            + "WHERE o.vendor_id = #{vendorId} AND o.deleted_at IS NULL AND r.deleted_at IS NULL "
            + "ORDER BY r.id DESC")
    List<Register> findByVendorId(Long vendorId);

    @Select("SELECT r.* FROM register r JOIN outlet o ON o.id = r.outlet_id "
            + "WHERE r.id = #{id} AND r.deleted_at IS NULL "
            + "AND o.vendor_id = #{vendorId} AND o.deleted_at IS NULL")
    Register findByIdAndVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("SELECT * FROM register WHERE id = #{id}")
    Register findById(Long id);

    @Select("SELECT * FROM register WHERE outlet_id = #{outletId} AND deleted_at IS NULL ORDER BY id ASC")
    List<Register> findByOutletId(Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register (name, outlet_id, invoice_number, open_time, closed) "
            + "VALUES (#{name}, #{outletId}, #{invoiceNumber}, #{openTime}, CASE WHEN #{closed} THEN 1 ELSE 0 END)")
    int insert(Register r);

    @Update("UPDATE register SET name=#{register.name}, outlet_id=#{register.outletId}, invoice_number=#{register.invoiceNumber}, "
            + "open_time=#{register.openTime}, closed=#{register.closed} WHERE id=#{register.id} AND outlet_id IN "
            + "(SELECT id FROM outlet WHERE vendor_id=#{vendorId})")
    int update(@Param("register") Register register, @Param("vendorId") Long vendorId);

    @Update("UPDATE register SET deleted_at = NOW() WHERE id=#{id} AND outlet_id IN "
            + "(SELECT id FROM outlet WHERE vendor_id=#{vendorId})")
    int softDelete(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Update("UPDATE register SET invoice_number=#{invoiceNumber} WHERE id=#{id} AND outlet_id IN "
            + "(SELECT id FROM outlet WHERE vendor_id=#{vendorId})")
    int overrideInvoiceNumber(@Param("id") Long id, @Param("vendorId") Long vendorId,
                              @Param("invoiceNumber") String invoiceNumber);

    @Update("UPDATE register SET surcharging=#{surcharging} WHERE id=#{id} AND outlet_id IN "
            + "(SELECT id FROM outlet WHERE vendor_id=#{vendorId})")
    int updateSurcharging(@Param("id") Long id, @Param("vendorId") Long vendorId,
                          @Param("surcharging") String surcharging);
}

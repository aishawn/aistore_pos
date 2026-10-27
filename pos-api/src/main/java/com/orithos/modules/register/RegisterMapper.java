package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface RegisterMapper {

    @Select("SELECT * FROM register WHERE deleted_at IS NULL ORDER BY id DESC")
    List<Register> findAll();

    @Select("SELECT * FROM register WHERE id = #{id}")
    Register findById(Long id);

    @Select("SELECT * FROM register WHERE outlet_id = #{outletId} AND deleted_at IS NULL ORDER BY id ASC")
    List<Register> findByOutletId(Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register (name, outlet_id, invoice_number, open_time, closed) "
            + "VALUES (#{name}, #{outletId}, #{invoiceNumber}, #{openTime}, CASE WHEN #{closed} THEN 1 ELSE 0 END)")
    int insert(Register r);

    @Update("UPDATE register SET name=#{name}, outlet_id=#{outletId}, invoice_number=#{invoiceNumber}, "
            + "open_time=#{openTime}, closed=#{closed} WHERE id=#{id}")
    int update(Register r);

    @Update("UPDATE register SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Update("UPDATE register SET invoice_number=#{invoiceNumber} WHERE id=#{id}")
    int overrideInvoiceNumber(@Param("id") Long id, @Param("invoiceNumber") String invoiceNumber);

    @Update("UPDATE register SET surcharging=#{surcharging} WHERE id=#{id}")
    int updateSurcharging(@Param("id") Long id, @Param("surcharging") String surcharging);
}

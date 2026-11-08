package com.orithos.modules.payment;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PaymentMethodMapper {

    @Select("SELECT * FROM payment_method WHERE deleted_at IS NULL ORDER BY id DESC")
    List<PaymentMethod> findAll();

    @Select("SELECT * FROM payment_method WHERE id = #{id}")
    PaymentMethod findById(Long id);

    @Select("SELECT * FROM payment_method WHERE type = #{type} AND deleted_at IS NULL ORDER BY name LIMIT 1")
    PaymentMethod findByType(String type);

    @Select("SELECT * FROM payment_method WHERE name = #{name} AND deleted_at IS NULL ORDER BY id LIMIT 1")
    PaymentMethod findByName(String name);

    @Select("SELECT pm.* FROM register_payment_method rpm "
            + "JOIN payment_method pm ON pm.id=rpm.payment_method_id AND pm.outlet_id=rpm.outlet_id "
            + "WHERE rpm.register_id=#{registerId} AND rpm.outlet_id=#{outletId} "
            + "AND pm.type=#{type} AND pm.deleted_at IS NULL ORDER BY pm.id LIMIT 1")
    PaymentMethod findForRegisterByType(@Param("registerId") Long registerId,
                                        @Param("outletId") Long outletId,
                                        @Param("type") String type);

    @Select("SELECT pm.* FROM register_payment_method rpm "
            + "JOIN payment_method pm ON pm.id=rpm.payment_method_id AND pm.outlet_id=rpm.outlet_id "
            + "WHERE rpm.register_id=#{registerId} AND rpm.outlet_id=#{outletId} "
            + "AND pm.name=#{name} AND pm.deleted_at IS NULL ORDER BY pm.id LIMIT 1")
    PaymentMethod findForRegisterByName(@Param("registerId") Long registerId,
                                        @Param("outletId") Long outletId,
                                        @Param("name") String name);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO payment_method (name, type, surcharge, always_open_drawer, always_print, "
            + "use_rounding, default_pay_exact, background_colour, text_colour, outlet_id) "
            + "VALUES (#{name}, #{type}, #{surcharge}, CASE WHEN #{alwaysOpenDrawer} THEN 1 ELSE 0 END, CASE WHEN #{alwaysPrint} THEN 1 ELSE 0 END, "
            + "CASE WHEN #{useRounding} THEN 1 ELSE 0 END, CASE WHEN #{defaultPayExact} THEN 1 ELSE 0 END, #{backgroundColour}, #{textColour}, #{outletId})")
    int insert(PaymentMethod p);

    @Update("UPDATE payment_method SET name=#{name}, type=#{type}, surcharge=#{surcharge} WHERE id=#{id}")
    int update(PaymentMethod p);

    @Update("UPDATE payment_method SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);
}

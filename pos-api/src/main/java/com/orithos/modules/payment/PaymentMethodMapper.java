package com.orithos.modules.payment;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface PaymentMethodMapper {

    @Select("SELECT * FROM payment_method WHERE outlet_id=#{outletId} AND deleted_at IS NULL ORDER BY id DESC")
    List<PaymentMethod> findAll(@Param("outletId") Long outletId);

    @Select("SELECT * FROM payment_method WHERE id = #{id} AND outlet_id=#{outletId}")
    PaymentMethod findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT * FROM payment_method WHERE outlet_id=#{outletId} AND type = #{type} AND deleted_at IS NULL ORDER BY name LIMIT 1")
    PaymentMethod findByType(@Param("type") String type, @Param("outletId") Long outletId);

    @Select("SELECT * FROM payment_method WHERE outlet_id=#{outletId} AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})) AND deleted_at IS NULL ORDER BY id LIMIT 1")
    PaymentMethod findByName(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("SELECT * FROM payment_method WHERE outlet_id=#{outletId} AND deleted_at IS NULL ORDER BY id ASC")
    List<PaymentMethod> findAllActiveAsc(@Param("outletId") Long outletId);

    @Update("UPDATE sale_payment SET payment_method_id=#{target} WHERE payment_method_id=#{source}")
    int reassignSalePayment(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE customer_payment SET payment_method_id=#{target} WHERE payment_method_id=#{source}")
    int reassignCustomerPayment(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE register_closure_payment SET payment_method_id=#{target} WHERE payment_method_id=#{source}")
    int reassignRegisterClosurePayment(@Param("target") Long target, @Param("source") Long source);

    @Delete("DELETE FROM register_payment_method WHERE payment_method_id=#{source} AND EXISTS ("
            + "SELECT 1 FROM register_payment_method keeper WHERE keeper.register_id=register_payment_method.register_id "
            + "AND keeper.outlet_id=register_payment_method.outlet_id AND keeper.payment_method_id=#{target})")
    int dropConflictingRegisterAssignments(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE register_payment_method SET payment_method_id=#{target} WHERE payment_method_id=#{source}")
    int reassignRegisterPaymentMethod(@Param("target") Long target, @Param("source") Long source);

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

    @Select("SELECT pm.id AS payment_method_id, pm.name AS name, pm.type AS type, "
            + "r.id AS register_id, r.name AS register_name "
            + "FROM outlet o JOIN register r ON r.outlet_id=o.id AND r.deleted_at IS NULL "
            + "JOIN register_payment_method rpm ON rpm.register_id=r.id AND rpm.outlet_id=o.id "
            + "JOIN payment_method pm ON pm.id=rpm.payment_method_id AND pm.outlet_id=o.id "
            + "WHERE o.id=#{outletId} AND o.vendor_id=#{vendorId} AND pm.deleted_at IS NULL "
            + "ORDER BY pm.name, r.name, pm.id")
    List<RegisterPaymentMethodView> findAssignedForOutlet(@Param("vendorId") Long vendorId,
                                                          @Param("outletId") Long outletId);

    @Select("SELECT payment_method_id FROM register_payment_method WHERE register_id=#{registerId} AND outlet_id=#{outletId} ORDER BY payment_method_id")
    List<Long> findIdsForRegister(@Param("registerId") Long registerId, @Param("outletId") Long outletId);

    @Select("<script>SELECT COUNT(DISTINCT id) FROM payment_method WHERE outlet_id=#{outletId} AND deleted_at IS NULL AND id IN "
            + "<foreach item='id' collection='ids' open='(' separator=',' close=')'>#{id}</foreach></script>")
    int countActiveIdsInOutlet(@Param("ids") List<Long> ids, @Param("outletId") Long outletId);

    @Delete("DELETE FROM register_payment_method WHERE register_id=#{registerId} AND outlet_id=#{outletId}")
    int deleteRegisterAssignments(@Param("registerId") Long registerId, @Param("outletId") Long outletId);

    @Insert("INSERT INTO register_payment_method (register_id, payment_method_id, outlet_id) VALUES (#{registerId}, #{paymentMethodId}, #{outletId})")
    int insertRegisterAssignment(@Param("registerId") Long registerId, @Param("paymentMethodId") Long paymentMethodId,
                                 @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO payment_method (name, type, surcharge, always_open_drawer, always_print, "
            + "use_rounding, default_pay_exact, background_colour, text_colour, outlet_id) "
            + "VALUES (#{name}, #{type}, #{surcharge}, CASE WHEN #{alwaysOpenDrawer} THEN 1 ELSE 0 END, CASE WHEN #{alwaysPrint} THEN 1 ELSE 0 END, "
            + "CASE WHEN #{useRounding} THEN 1 ELSE 0 END, CASE WHEN #{defaultPayExact} THEN 1 ELSE 0 END, #{backgroundColour}, #{textColour}, #{outletId})")
    int insert(PaymentMethod p);

    @Update("UPDATE payment_method SET name=#{method.name}, type=#{method.type}, surcharge=#{method.surcharge}, "
            + "always_open_drawer=CASE WHEN #{method.alwaysOpenDrawer} THEN 1 ELSE 0 END, "
            + "always_print=CASE WHEN #{method.alwaysPrint} THEN 1 ELSE 0 END, "
            + "use_rounding=CASE WHEN #{method.useRounding} THEN 1 ELSE 0 END, "
            + "default_pay_exact=CASE WHEN #{method.defaultPayExact} THEN 1 ELSE 0 END, "
            + "background_colour=#{method.backgroundColour}, text_colour=#{method.textColour} "
            + "WHERE id=#{method.id} AND outlet_id=#{outletId}")
    int update(@Param("method") PaymentMethod method, @Param("outletId") Long outletId);

    @Update("UPDATE payment_method SET deleted_at = NOW() WHERE id=#{id} AND outlet_id=#{outletId}")
    int softDelete(@Param("id") Long id, @Param("outletId") Long outletId);
}

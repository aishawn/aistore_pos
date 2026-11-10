package com.orithos.modules.customerpayment;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CustomerPaymentMapper {

    @Select("""
        SELECT cp.*, pm.name AS payment_method_name, u.name AS user_name
        FROM customer_payment cp JOIN customer c ON c.id = cp.customer_id
        LEFT JOIN payment_method pm ON pm.id = cp.payment_method_id
        LEFT JOIN app_user u ON u.id = cp.user_id
        WHERE c.outlet_id = #{outletId}
          AND (#{customerId} IS NULL OR cp.customer_id = #{customerId})
          AND (#{status} IS NULL OR cp.status = #{status})
        ORDER BY cp.timestamp DESC LIMIT #{size} OFFSET #{offset}
        """)
    List<CustomerPayment> page(@Param("customerId") Long customerId,
                               @Param("status") String status,
                               @Param("outletId") Long outletId,
                               @Param("size") int size,
                               @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM customer_payment cp JOIN customer c ON c.id=cp.customer_id WHERE c.outlet_id=#{outletId} "
            + "AND (#{customerId} IS NULL OR customer_id = #{customerId}) "
            + "AND (#{status} IS NULL OR status = #{status})")
    long count(@Param("customerId") Long customerId, @Param("status") String status, @Param("outletId") Long outletId);

    @Select("""
        SELECT cp.*, pm.name AS payment_method_name, u.name AS user_name
        FROM customer_payment cp JOIN customer c ON c.id = cp.customer_id
        LEFT JOIN payment_method pm ON pm.id = cp.payment_method_id
        LEFT JOIN app_user u ON u.id = cp.user_id
        WHERE cp.id = #{id} AND c.outlet_id = #{outletId}
        """)
    CustomerPayment findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO customer_payment (customer_id, payment_method_id, user_id, register_id, "
            + "reference, status, start_balance, amount, rounding, timestamp, relates_to_id, cancelled_at, outlet_id) "
            + "VALUES (#{customerId}, #{paymentMethodId}, #{userId}, #{registerId}, "
            + "#{reference}, #{status}, #{startBalance}, #{amount}, #{rounding}, #{timestamp}, #{relatesToId}, #{cancelledAt}, #{outletId})")
    int insert(CustomerPayment p);

    @Update("UPDATE customer_payment SET cancelled_at = NOW(), status = 'VOIDED' WHERE id = #{id}")
    int voidPayment(Long id);
}

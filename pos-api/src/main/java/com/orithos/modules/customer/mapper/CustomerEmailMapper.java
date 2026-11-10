package com.orithos.modules.customer.mapper;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CustomerEmailMapper {

    @Select("SELECT email FROM customer_email WHERE customer_id = #{customerId} ORDER BY sort_order, id")
    List<String> findEmailsByCustomerId(Long customerId);

    @Delete("DELETE FROM customer_email WHERE customer_id = #{customerId}")
    int deleteByCustomerId(Long customerId);

    @Insert("INSERT INTO customer_email (customer_id, email, sort_order, outlet_id) "
            + "VALUES (#{customerId}, #{email}, #{sortOrder}, #{outletId})")
    int insert(@Param("customerId") Long customerId,
               @Param("email") String email,
               @Param("sortOrder") int sortOrder,
               @Param("outletId") Long outletId);

    @Select("""
        SELECT COUNT(*) FROM customer c
        WHERE c.deleted_at IS NULL
          AND (#{excludeCustomerId} IS NULL OR c.id != #{excludeCustomerId})
          AND (
            EXISTS (
              SELECT 1 FROM customer_email ce
              WHERE ce.customer_id = c.id
                AND LOWER(TRIM(ce.email)) = LOWER(TRIM(#{email}))
            )
            OR (
              NOT EXISTS (SELECT 1 FROM customer_email ce2 WHERE ce2.customer_id = c.id)
              AND c.email IS NOT NULL
              AND TRIM(c.email) <> ''
              AND LOWER(TRIM(c.email)) = LOWER(TRIM(#{email}))
            )
          )
        """)
    long countActiveByEmailExcludingCustomer(@Param("email") String email,
                                             @Param("excludeCustomerId") Long excludeCustomerId);

    @Update("""
        UPDATE customer_email ce
        INNER JOIN customer c ON c.id = ce.customer_id
        SET ce.customer_deleted_at = c.deleted_at
        WHERE ce.customer_id = #{customerId}
        """)
    int syncDeletedAtByCustomerId(@Param("customerId") Long customerId);
}

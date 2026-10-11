package com.orithos.modules.customerpayment;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CustomerPaymentAllocationMapper {

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO customer_payment_allocation (payment_id, sale_id, amount) "
            + "VALUES (#{paymentId}, #{saleId}, #{amount})")
    int insert(CustomerPaymentAllocation a);

    @Select("SELECT * FROM customer_payment_allocation WHERE payment_id = #{paymentId} "
            + "ORDER BY created_at DESC")
    List<CustomerPaymentAllocation> findByPayment(@Param("paymentId") Long paymentId);
}

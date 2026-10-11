package com.orithos.modules.sale;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SalePaymentMapper {

    @Insert("""
        INSERT INTO sale_payment (sale_id, payment_method_id, subtype, register_id, status,
                                  amount, rounding, cashout, process_time)
        VALUES (#{saleId}, #{paymentMethodId}, #{subtype}, #{registerId}, #{status},
                #{amount}, #{rounding}, #{cashout}, #{processTime})
        """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(SalePayment p);

    @Select("SELECT * FROM sale_payment WHERE sale_id = #{saleId} ORDER BY id")
    List<SalePayment> findBySaleId(Long saleId);

    @Select("""
        SELECT COALESCE(SUM(amount), 0) FROM sale_payment
        WHERE sale_id = #{saleId} AND status = 'COMPLETED'
        """)
    java.math.BigDecimal sumAmountBySaleId(Long saleId);
}

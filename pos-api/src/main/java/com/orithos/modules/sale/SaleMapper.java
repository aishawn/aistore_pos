package com.orithos.modules.sale;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SaleMapper {

    @Select("""
        SELECT s.*, u.name AS user_name, c.name AS customer_name
        FROM sale s
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN customer c ON c.id = s.customer_id
        WHERE (#{status} IS NULL OR s.status = #{status})
          AND (#{customerId} IS NULL OR s.customer_id = #{customerId})
        ORDER BY s.created_at DESC LIMIT #{size} OFFSET #{offset}
        """)
    List<Sale> page(@Param("status") String status, @Param("customerId") Long customerId,
                    @Param("size") int size, @Param("offset") int offset);

    @Select("""
        SELECT COUNT(*) FROM sale s
        WHERE (#{status} IS NULL OR s.status = #{status})
          AND (#{customerId} IS NULL OR s.customer_id = #{customerId})
        """)
    long count(@Param("status") String status, @Param("customerId") Long customerId);

    @Select("""
        SELECT s.*, u.name AS user_name, c.name AS customer_name
        FROM sale s
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN customer c ON c.id = s.customer_id
        WHERE s.id = #{id}
        """)
    Sale findById(Long id);

    @Select("""
        SELECT si.*, COALESCE(p.name, si.note) AS note
        FROM sale_item si
        LEFT JOIN product p ON p.id = si.product_id
        WHERE si.sale_id = #{saleId} ORDER BY si.id
        """)
    List<SaleItem> findItemsBySaleId(Long saleId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO sale (register_id, user_id, customer_id, outlet_id, status, invoice_id, note,
                          total_quantity, total_price, total_tax, outstanding, total_change, cashout,
                          business_date, local_sold_at)
        VALUES (#{registerId}, #{userId}, #{customerId}, COALESCE(#{outletId}, 1), #{status}, #{invoiceId}, #{note},
                #{totalQuantity}, #{totalPrice}, #{totalTax}, #{outstanding}, #{totalChange}, #{cashout},
                #{businessDate}, #{localSoldAt})
        """)
    int insert(Sale s);

    @Select("SELECT COUNT(*) FROM product WHERE id = #{id}")
    long productExists(Long id);

    @Select("""
        SELECT id FROM product
        WHERE deleted_at IS NULL AND name = #{name}
        ORDER BY id
        LIMIT 1
        """)
    Long findProductIdByName(@Param("name") String name);

    @Update("UPDATE sale SET stock_applied = 1 WHERE id = #{id}")
    int markStockApplied(Long id);

    @Select("""
        SELECT tr.amount FROM product p
        LEFT JOIN tax_rate tr ON tr.id = p.tax_rate_id AND tr.deleted_at IS NULL
        WHERE p.id = #{id}
        """)
    java.math.BigDecimal findSellTaxPercent(Long id);

    @Select("SELECT tax_rate_id FROM product WHERE id = #{id}")
    Long findTaxRateId(Long id);

    @Select("SELECT COUNT(*) FROM customer WHERE id = #{id}")
    long customerExists(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO sale_item (sale_id, product_id, outlet_id, quantity, case_quantity, cost, base_price,
                               total_price, savings, tax, tax_rate_id, discount_amount, discount_reason, note)
        VALUES (#{saleId}, #{productId}, COALESCE(#{outletId}, 1), #{quantity}, #{caseQuantity}, #{cost}, #{basePrice},
                #{totalPrice}, #{savings}, #{tax}, #{taxRateId}, #{discountAmount}, #{discountReason}, #{note})
        """)
    int insertItem(SaleItem item);

    @Update("""
        UPDATE sale SET status=#{status}, customer_id=#{customerId}, note=#{note},
               total_quantity=#{totalQuantity}, total_price=#{totalPrice}, outstanding=#{outstanding}
        WHERE id=#{id}
        """)
    int update(Sale s);

    @Update("""
        UPDATE sale SET status=#{status}, outstanding=#{outstanding}, total_change=#{totalChange},
               invoice_id=#{invoiceId}, cashout=#{cashout}, total_tax=#{totalTax},
               total_rounding=#{totalRounding}, business_date=#{businessDate}, local_sold_at=#{localSoldAt}
        WHERE id=#{id}
        """)
    int updatePaymentState(Sale s);

    @Update("UPDATE sale SET status='VOIDED', outstanding=0 WHERE id=#{id}")
    int markVoid(Long id);

    @Update("UPDATE sale SET status='ACTIVE' WHERE id=#{id} AND status='PARKED'")
    int unpark(Long id);

    @Update("UPDATE sale SET status='VOIDED', outstanding=0 WHERE id=#{id} AND status='PARKED'")
    int voidParked(Long id);

    /**
     * Void parked sales older than the keep window.
     * {@code expireBefore} is a Sydney business date: rows with an earlier {@code business_date} go.
     * Rows with no business date fall back to {@code created_at} (UTC wall clock).
     */
    @Update("""
        UPDATE sale
        SET status = 'VOIDED',
            outstanding = 0,
            internal_note = TRIM(CONCAT(COALESCE(internal_note, ''), ' Auto-expired parked sale'))
        WHERE status = 'PARKED'
          AND (
            (business_date IS NOT NULL AND business_date < #{expireBefore})
            OR (business_date IS NULL AND created_at < #{createdBeforeUtc})
          )
        """)
    int expireParkedBefore(@Param("expireBefore") java.time.LocalDate expireBefore,
                           @Param("createdBeforeUtc") java.time.LocalDateTime createdBeforeUtc);

    @Select("""
        SELECT s.created_at AS timestamp, u.name AS user_name, si.quantity,
               COALESCE(p.name, si.note) AS item, si.total_price AS price
        FROM sale_item si
        JOIN sale s ON s.id = si.sale_id
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN product p ON p.id = si.product_id
        WHERE s.customer_id = #{customerId}
          AND s.status != 'VOIDED'
        ORDER BY s.created_at DESC, si.id DESC
        LIMIT #{limit}
        """)
    List<com.orithos.modules.customer.CustomerRecentSaleLine> recentLinesByCustomer(
            @Param("customerId") Long customerId, @Param("limit") int limit);
}

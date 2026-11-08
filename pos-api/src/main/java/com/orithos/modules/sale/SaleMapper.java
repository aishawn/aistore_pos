package com.orithos.modules.sale;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface SaleMapper {

    /** Legacy signature retained for existing mock clients; production callers must provide tenant scope. */
    @Deprecated
    default List<Sale> page(String status, Long customerId, int size, int offset) {
        return page(null, null, status, customerId, size, offset);
    }

    @Select("""
        SELECT s.*, u.name AS user_name, c.name AS customer_name
        FROM sale s JOIN outlet o ON o.id = s.outlet_id
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN customer c ON c.id = s.customer_id
        WHERE o.vendor_id = #{vendorId} AND o.deleted_at IS NULL
          AND (#{outletId} IS NULL OR s.outlet_id = #{outletId})
          AND (#{status} IS NULL OR s.status = #{status})
          AND (#{customerId} IS NULL OR s.customer_id = #{customerId})
        ORDER BY s.created_at DESC LIMIT #{size} OFFSET #{offset}
        """)
    List<Sale> page(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                    @Param("status") String status, @Param("customerId") Long customerId,
                    @Param("size") int size, @Param("offset") int offset);

    @Select("""
        SELECT COUNT(*) FROM sale s JOIN outlet o ON o.id = s.outlet_id
        WHERE o.vendor_id = #{vendorId} AND o.deleted_at IS NULL
          AND (#{outletId} IS NULL OR s.outlet_id = #{outletId})
          AND (#{status} IS NULL OR s.status = #{status})
          AND (#{customerId} IS NULL OR s.customer_id = #{customerId})
        """)
    long count(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
               @Param("status") String status, @Param("customerId") Long customerId);

    @Select("""
        SELECT s.*, u.name AS user_name, c.name AS customer_name
        FROM sale s JOIN outlet o ON o.id = s.outlet_id
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN customer c ON c.id = s.customer_id
        WHERE s.id = #{id} AND o.vendor_id = #{vendorId} AND o.deleted_at IS NULL
          AND (#{outletId} IS NULL OR s.outlet_id = #{outletId})
        """)
    Sale findById(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

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
        VALUES (#{registerId}, #{userId}, #{customerId}, #{outletId}, #{status}, #{invoiceId}, #{note},
                #{totalQuantity}, #{totalPrice}, #{totalTax}, #{outstanding}, #{totalChange}, #{cashout},
                #{businessDate}, #{localSoldAt})
        """)
    int insert(Sale s);

    @Select("SELECT COUNT(*) FROM product p JOIN outlet o ON o.id=p.outlet_id WHERE p.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL AND p.deleted_at IS NULL")
    long productExists(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("""
        SELECT id FROM product
        WHERE deleted_at IS NULL AND name = #{name}
          AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id = #{vendorId} AND deleted_at IS NULL)
        ORDER BY id
        LIMIT 1
        """)
    Long findProductIdByName(@Param("name") String name, @Param("vendorId") Long vendorId);

    @Update("UPDATE sale SET stock_applied = 1 WHERE id = #{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id = #{vendorId})")
    int markStockApplied(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Insert("INSERT INTO inventory_movement (vendor_id, outlet_id, product_id, quantity_delta, source_type, source_id, source_line_id, idempotency_key, actor_id) VALUES (#{vendorId}, #{outletId}, #{productId}, #{quantityDelta}, 'POS_SALE', #{sourceId}, #{sourceLineId}, #{idempotencyKey}, #{actorId}) ON CONFLICT (source_type, source_line_id) DO NOTHING")
    int insertSaleInventoryMovement(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId,
                                    @Param("productId") Long productId, @Param("quantityDelta") java.math.BigDecimal quantityDelta,
                                    @Param("sourceId") Long sourceId, @Param("sourceLineId") Long sourceLineId,
                                    @Param("idempotencyKey") String idempotencyKey, @Param("actorId") Long actorId);

    @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(CAST(#{vendorId} AS TEXT) || ':' || #{key}, 0))) lock_result")
    Integer lockCheckoutKey(@Param("vendorId") Long vendorId, @Param("key") String key);

    @Select("SELECT request_hash FROM sale_checkout_idempotency WHERE vendor_id=#{vendorId} AND idempotency_key=#{key}")
    String findCheckoutRequestHash(@Param("vendorId") Long vendorId, @Param("key") String key);

    @Select("SELECT response_json FROM sale_checkout_idempotency WHERE vendor_id=#{vendorId} AND idempotency_key=#{key}")
    String findCheckoutResponse(@Param("vendorId") Long vendorId, @Param("key") String key);

    @Insert("INSERT INTO sale_checkout_idempotency (vendor_id, idempotency_key, request_hash, response_json) VALUES (#{vendorId}, #{key}, #{requestHash}, #{responseJson})")
    int insertCheckoutResponse(@Param("vendorId") Long vendorId, @Param("key") String key,
                               @Param("requestHash") String requestHash, @Param("responseJson") String responseJson);

    @Select("""
        SELECT tr.amount FROM product p
        LEFT JOIN tax_rate tr ON tr.id = p.tax_rate_id AND tr.deleted_at IS NULL
        WHERE p.id = #{id} AND p.outlet_id = #{outletId}
          AND p.outlet_id IN (SELECT id FROM outlet WHERE vendor_id = #{vendorId} AND deleted_at IS NULL)
        """)
    java.math.BigDecimal findSellTaxPercent(@Param("id") Long id, @Param("vendorId") Long vendorId,
                                            @Param("outletId") Long outletId);

    @Select("SELECT tax_rate_id FROM product WHERE id = #{id} AND outlet_id = #{outletId} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id = #{vendorId} AND deleted_at IS NULL)")
    Long findTaxRateId(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM customer c JOIN outlet o ON o.id=c.outlet_id WHERE c.id=#{id} AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND o.deleted_at IS NULL")
    long customerExists(@Param("id") Long id, @Param("vendorId") Long vendorId,
                        @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO sale_item (sale_id, product_id, outlet_id, quantity, case_quantity, cost, base_price,
                               total_price, savings, tax, tax_rate_id, discount_amount, discount_reason, note)
        VALUES (#{saleId}, #{productId}, #{outletId}, #{quantity}, #{caseQuantity}, #{cost}, #{basePrice},
                #{totalPrice}, #{savings}, #{tax}, #{taxRateId}, #{discountAmount}, #{discountReason}, #{note})
        """)
    int insertItem(SaleItem item);

    @Update("""
        UPDATE sale SET status=#{sale.status}, customer_id=#{sale.customerId}, note=#{sale.note},
               total_quantity=#{sale.totalQuantity}, total_price=#{sale.totalPrice}, outstanding=#{sale.outstanding}
        WHERE id=#{sale.id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND (#{outletId} IS NULL OR id=#{outletId}) AND deleted_at IS NULL)
        """)
    int update(@Param("sale") Sale s, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Update("""
        UPDATE sale SET status=#{sale.status}, outstanding=#{sale.outstanding}, total_change=#{sale.totalChange},
               invoice_id=#{sale.invoiceId}, cashout=#{sale.cashout}, total_tax=#{sale.totalTax},
               total_rounding=#{sale.totalRounding}, business_date=#{sale.businessDate}, local_sold_at=#{sale.localSoldAt}
        WHERE id=#{sale.id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND (#{outletId} IS NULL OR id=#{outletId}) AND deleted_at IS NULL)
        """)
    int updatePaymentState(@Param("sale") Sale s, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Update("UPDATE sale SET status='VOIDED', outstanding=0 WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND (#{outletId} IS NULL OR id=#{outletId}) AND deleted_at IS NULL)")
    int markVoid(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Update("UPDATE sale SET status='ACTIVE' WHERE id=#{id} AND status='PARKED' AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND (#{outletId} IS NULL OR id=#{outletId}) AND deleted_at IS NULL)")
    int unpark(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Update("UPDATE sale SET status='VOIDED', outstanding=0 WHERE id=#{id} AND status='PARKED' AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND (#{outletId} IS NULL OR id=#{outletId}) AND deleted_at IS NULL)")
    int voidParked(@Param("id") Long id, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

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

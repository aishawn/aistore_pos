package com.orithos.modules.product;

import lombok.Data;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface ProductActivityMapper {

    @Select("""
            SELECT MONTH(COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))) AS month,
                   COALESCE(SUM(si.total_price), 0) AS amount
            FROM sale_item si
            JOIN sale s ON s.id = si.sale_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND (si.product_id = #{productId}
                   OR (si.product_id IS NULL AND si.note = (SELECT name FROM product WHERE id = #{productId} LIMIT 1)))
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) >= #{from}
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) < #{to}
            GROUP BY MONTH(COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)))
            """)
    List<MonthAmount> salesByMonth(@Param("productId") Long productId,
                                   @Param("from") String from,
                                   @Param("to") String to);

    @Select("""
            SELECT MONTH(COALESCE(DATE(po.received_at), po.order_date)) AS month,
                   COALESCE(SUM(COALESCE(op.received_quantity, op.ordered_quantity, 0) * COALESCE(op.base_cost, 0)), 0) AS amount
            FROM order_product op
            JOIN purchase_order po ON po.id = op.order_id
            WHERE op.product_id = #{productId}
              AND po.status = 'RECEIVED'
              AND (po.type IS NULL OR po.type <> 'TRANSFER')
              AND COALESCE(DATE(po.received_at), po.order_date) >= #{from}
              AND COALESCE(DATE(po.received_at), po.order_date) < #{to}
            GROUP BY MONTH(COALESCE(DATE(po.received_at), po.order_date))
            """)
    List<MonthAmount> purchasesByMonth(@Param("productId") Long productId,
                                       @Param("from") String from,
                                       @Param("to") String to);

    @Select("""
            SELECT s.id AS sale_id, s.invoice_id, 
                   COALESCE(s.local_sold_at, s.created_at) AS sold_at,
                   si.quantity, si.base_price AS unit_price, si.total_price, u.name AS user_name
            FROM sale_item si
            JOIN sale s ON s.id = si.sale_id
            LEFT JOIN app_user u ON u.id = s.user_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND (si.product_id = #{productId}
                   OR (si.product_id IS NULL AND si.note = (SELECT name FROM product WHERE id = #{productId} LIMIT 1)))
            ORDER BY COALESCE(s.local_sold_at, s.created_at) DESC, si.id DESC
            LIMIT 200
            """)
    List<SaleLine> sales(@Param("productId") Long productId);

    @Select("""
            SELECT MAX(COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)))
            FROM sale_item si
            JOIN sale s ON s.id = si.sale_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND (si.product_id = #{productId}
                   OR (si.product_id IS NULL AND si.note = (SELECT name FROM product WHERE id = #{productId} LIMIT 1)))
            """)
    java.time.LocalDate latestSaleDate(@Param("productId") Long productId);

    @Select("""
            SELECT po.id AS order_id, po.invoice_number, po.reference, po.status, po.type,
                   COALESCE(po.received_at, po.order_date) AS occurred_at,
                   COALESCE(op.received_quantity, op.ordered_quantity, 0) AS quantity,
                   op.base_cost AS unit_cost
            FROM order_product op
            JOIN purchase_order po ON po.id = op.order_id
            WHERE op.product_id = #{productId}
              AND (#{transfer} = 1 AND po.type = 'TRANSFER'
                   OR #{transfer} = 0 AND (po.type IS NULL OR po.type <> 'TRANSFER'))
            ORDER BY COALESCE(po.received_at, po.order_date) DESC, op.id DESC
            LIMIT 200
            """)
    List<OrderLine> orders(@Param("productId") Long productId, @Param("transfer") int transfer);

    @Data
    class MonthAmount {
        private Integer month;
        private BigDecimal amount;
    }

    @Data
    class SaleLine {
        private Long saleId;
        private String invoiceId;
        private LocalDateTime soldAt;
        private BigDecimal quantity;
        private BigDecimal unitPrice;
        private BigDecimal totalPrice;
        private String userName;
    }

    @Data
    class OrderLine {
        private Long orderId;
        private String invoiceNumber;
        private String reference;
        private String status;
        private String type;
        private LocalDateTime occurredAt;
        private BigDecimal quantity;
        private BigDecimal unitCost;
    }
}

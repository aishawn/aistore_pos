package com.orithos.modules.order;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface OrderMapper {

    List<Order> page(@Param("q") OrderListQuery q);

    long count(@Param("q") OrderListQuery q);

    Order findById(@Param("id") Long id);

    Order findByIdForVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("SELECT * FROM order_product WHERE order_id = #{orderId} ORDER BY id")
    List<OrderProduct> findProductsByOrderId(Long orderId);

    @Select("SELECT po.* FROM purchase_order po JOIN outlet o ON o.id=po.outlet_id "
            + "WHERE po.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL FOR UPDATE")
    Order lockPurchaseOrderForVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(CAST(#{vendorId} AS TEXT) || ':' || #{key}, 0))) lock_result")
    Integer lockReceiptIdempotencyKey(@Param("vendorId") Long vendorId, @Param("key") String key);

    @Select("SELECT id, order_id AS orderId, product_id AS productId, outlet_id AS outletId, "
            + "supplier_id AS supplierId, supplier_code AS supplierCode, case_quantity AS caseQuantity, "
            + "ordered_quantity AS orderedQuantity, received_quantity AS receivedQuantity, "
            + "base_cost AS baseCost, ordered_cost AS orderedCost, fees, freight, rebate "
            + "FROM order_product WHERE id=#{lineId} AND order_id=#{orderId} FOR UPDATE")
    OrderProduct lockOrderProduct(@Param("lineId") Long lineId, @Param("orderId") Long orderId);

    @Select("SELECT id, vendor_id AS vendorId, order_id AS orderId, request_hash AS requestHash, "
            + "status, received_at AS receivedAt FROM purchase_receipt "
            + "WHERE vendor_id=#{vendorId} AND idempotency_key=#{key}")
    PurchaseReceipt findReceiptByKey(@Param("vendorId") Long vendorId, @Param("key") String key);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO purchase_receipt (vendor_id, order_id, outlet_id, idempotency_key, request_hash, status, received_by_id) "
            + "VALUES (#{vendorId}, #{orderId}, #{outletId}, #{idempotencyKey}, #{requestHash}, #{status}, #{receivedById}) "
            + "ON CONFLICT (vendor_id, idempotency_key) DO NOTHING")
    int insertReceipt(PurchaseReceipt receipt);

    @Insert("""
            INSERT INTO purchase_receipt_batch (receipt_line_id, batch_code, expiry_date, inventory_quantity)
            VALUES (#{lineId}, #{code}, #{expiryDate}, #{quantity})
            """)
    int insertReceiptBatch(@Param("lineId") Long lineId, @Param("code") String code,
                           @Param("expiryDate") java.time.LocalDate expiryDate,
                           @Param("quantity") java.math.BigDecimal quantity);

    @Update("UPDATE purchase_receipt SET status=#{status} WHERE id=#{id} AND vendor_id=#{vendorId}")
    int updateReceiptEventStatus(@Param("id") Long id, @Param("vendorId") Long vendorId,
                                 @Param("status") String status);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO purchase_receipt_line (receipt_id, order_product_id, product_id, received_quantity, inventory_quantity, unit_cost) "
            + "VALUES (#{receiptId}, #{orderProductId}, #{productId}, #{receivedQuantity}, #{inventoryQuantity}, #{unitCost})")
    int insertReceiptLine(PurchaseReceiptLine line);

    @Update("UPDATE order_product SET received_quantity=#{receivedQuantity} WHERE id=#{lineId} AND order_id=#{orderId}")
    int updateReceivedQuantity(@Param("lineId") Long lineId, @Param("orderId") Long orderId,
                               @Param("receivedQuantity") java.math.BigDecimal receivedQuantity);

    @Insert("INSERT INTO inventory_movement (vendor_id, outlet_id, product_id, quantity_delta, source_type, source_id, source_line_id, idempotency_key, actor_id) "
            + "VALUES (#{vendorId}, #{outletId}, #{productId}, #{quantityDelta}, 'PURCHASE_RECEIPT', #{sourceId}, #{sourceLineId}, #{idempotencyKey}, #{actorId})")
    int insertInventoryMovement(InventoryMovement movement);

    @Update("UPDATE purchase_order SET status=#{status}, received_at=CASE WHEN #{status}='RECEIVED' THEN CURRENT_TIMESTAMP ELSE received_at END, "
            + "received_by_id=#{userId} WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int updateReceiptStatus(@Param("id") Long id, @Param("vendorId") Long vendorId,
                            @Param("status") String status, @Param("userId") Long userId);

    @Select("SELECT COUNT(*) FROM purchase_order po WHERE invoice_number = #{invoiceNumber} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    long countByInvoiceNumber(@Param("invoiceNumber") String invoiceNumber, @Param("vendorId") Long vendorId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO purchase_order (type, status, from_id, to_id, order_date, due_date, "
            + "entered_as, invoice_number, reference, notes, internal_notes, include_freight, "
            + "total_cost, expected_total, fee_percentage, created_by_id, merged_into_id, outlet_id) "
            + "VALUES (#{type}, #{status}, #{fromId}, #{toId}, #{orderDate}, #{dueDate}, "
            + "#{enteredAs}, #{invoiceNumber}, #{reference}, #{notes}, #{internalNotes}, "
            + "CASE WHEN #{includeFreight} THEN 1 ELSE 0 END, "
            + "#{totalCost}, #{expectedTotal}, #{feePercentage}, #{createdById}, #{mergedIntoId}, #{outletId})")
    int insert(Order o);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO order_product (order_id, product_id, supplier_id, supplier_code, outlet_id, "
            + "case_quantity, ordered_quantity, received_quantity, base_cost, ordered_cost, "
            + "fees, freight, rebate) "
            + "VALUES (#{orderId}, #{productId}, #{supplierId}, #{supplierCode}, #{outletId}, "
            + "#{caseQuantity}, #{orderedQuantity}, #{receivedQuantity}, #{baseCost}, #{orderedCost}, "
            + "#{fees}, #{freight}, #{rebate})")
    int insertProduct(OrderProduct p);

    @Update("UPDATE purchase_order SET type=#{type}, from_id=#{fromId}, to_id=#{toId}, "
            + "order_date=#{orderDate}, due_date=#{dueDate}, entered_as=#{enteredAs}, "
            + "invoice_number=#{invoiceNumber}, reference=#{reference}, notes=#{notes}, "
            + "internal_notes=#{internalNotes}, include_freight=CASE WHEN #{includeFreight} THEN 1 ELSE 0 END, "
            + "total_cost=#{totalCost}, expected_total=#{expectedTotal}, fee_percentage=#{feePercentage} "
            + "WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int update(Order o);

    @Update("UPDATE purchase_order SET status='SENT', sent_at=NOW() WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int markSent(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Update("UPDATE purchase_order SET status='RECEIVED', received_at=NOW() WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int markReceived(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Update("UPDATE purchase_order SET received_at=NOW(), received_by_id=#{userId} WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int setReceivedMeta(@Param("id") Long id, @Param("userId") Long userId, @Param("vendorId") Long vendorId);

    @Update("UPDATE purchase_order SET total_cost=#{totalCost}, expected_total=#{expectedTotal}, "
            + "line_count=#{lineCount}, entered_as=#{enteredAs} WHERE id=#{id}")
    int updateTotals(@Param("id") Long id,
                     @Param("totalCost") java.math.BigDecimal totalCost,
                     @Param("expectedTotal") java.math.BigDecimal expectedTotal,
                     @Param("lineCount") int lineCount,
                     @Param("enteredAs") String enteredAs);

    @Update("UPDATE purchase_order SET status='CANCELLED' WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int markCancelled(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Update("UPDATE purchase_order SET status='OPEN' WHERE id=#{id} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int reopen(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Insert("INSERT INTO order_related (order_id, related_order_id) SELECT #{orderId}, #{relatedOrderId} WHERE "
            + "EXISTS (SELECT 1 FROM purchase_order p JOIN outlet o ON o.id=p.outlet_id WHERE p.id=#{orderId} AND o.vendor_id=#{vendorId}) AND "
            + "EXISTS (SELECT 1 FROM purchase_order p JOIN outlet o ON o.id=p.outlet_id WHERE p.id=#{relatedOrderId} AND o.vendor_id=#{vendorId})")
    int insertRelated(@Param("orderId") Long orderId, @Param("relatedOrderId") Long relatedOrderId, @Param("vendorId") Long vendorId);
}

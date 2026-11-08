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

    @Select("SELECT COUNT(*) FROM purchase_order po WHERE invoice_number = #{invoiceNumber} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    long countByInvoiceNumber(@Param("invoiceNumber") String invoiceNumber, @Param("vendorId") Long vendorId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO purchase_order (type, status, from_id, to_id, order_date, due_date, "
            + "entered_as, invoice_number, reference, notes, internal_notes, include_freight, "
            + "total_cost, expected_total, fee_percentage, created_by_id, merged_into_id, outlet_id) "
            + "VALUES (#{type}, #{status}, #{fromId}, #{toId}, #{orderDate}, #{dueDate}, "
            + "#{enteredAs}, #{invoiceNumber}, #{reference}, #{notes}, #{internalNotes}, #{includeFreight}, "
            + "#{totalCost}, #{expectedTotal}, #{feePercentage}, #{createdById}, #{mergedIntoId}, #{outletId})")
    int insert(Order o);

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
            + "internal_notes=#{internalNotes}, include_freight=#{includeFreight}, "
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

package com.orithos.modules.ai.invoice;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface InvoiceScanSessionMapper {

    @Select("""
            SELECT id, vendor_id AS vendorId, created_by AS createdBy, status, source_type AS sourceType,
                   supplier_name AS supplierName, supplier_abn AS supplierAbn, invoice_number AS invoiceNumber,
                   invoice_date AS invoiceDate, due_date AS dueDate, total_payable AS totalPayable,
                   gst_included AS gstIncluded, supplier_id AS supplierId, outlet_id AS outletId,
                   purchase_order_id AS purchaseOrderId, purchase_order_name AS purchaseOrderName,
                   receipt_id AS receiptId, receipt_name AS receiptName, source_filename AS sourceFilename,
                   source_content_type AS sourceContentType, notes, internal_notes AS internalNotes,
                   ocr_json AS ocrJson, confirmed_by AS confirmedBy, confirmed_at AS confirmedAt,
                   discarded_at AS discardedAt, created_at AS createdAt, updated_at AS updatedAt
            FROM invoice_scan_session
            WHERE vendor_id = #{vendorId}
              AND discarded_at IS NULL
              AND (#{status,jdbcType=VARCHAR} IS NULL OR status = #{status,jdbcType=VARCHAR})
              AND (
                #{query,jdbcType=VARCHAR} IS NULL
                OR supplier_name LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
                OR invoice_number LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
                OR supplier_abn LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
              )
            ORDER BY updated_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            """)
    List<InvoiceScanSessionEntity> list(@Param("vendorId") long vendorId,
                                        @Param("status") String status,
                                        @Param("query") String query,
                                        @Param("limit") int limit,
                                        @Param("offset") int offset);

    @Select("""
            SELECT COUNT(1)
            FROM invoice_scan_session
            WHERE vendor_id = #{vendorId}
              AND discarded_at IS NULL
              AND (#{status,jdbcType=VARCHAR} IS NULL OR status = #{status,jdbcType=VARCHAR})
              AND (
                #{query,jdbcType=VARCHAR} IS NULL
                OR supplier_name LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
                OR invoice_number LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
                OR supplier_abn LIKE CONCAT('%', #{query,jdbcType=VARCHAR}, '%')
              )
            """)
    long count(@Param("vendorId") long vendorId,
               @Param("status") String status,
               @Param("query") String query);

    @Select("""
            SELECT id, vendor_id AS vendorId, created_by AS createdBy, status, source_type AS sourceType,
                   supplier_name AS supplierName, supplier_abn AS supplierAbn, invoice_number AS invoiceNumber,
                   invoice_date AS invoiceDate, due_date AS dueDate, total_payable AS totalPayable,
                   gst_included AS gstIncluded, supplier_id AS supplierId, outlet_id AS outletId,
                   purchase_order_id AS purchaseOrderId, purchase_order_name AS purchaseOrderName,
                   receipt_id AS receiptId, receipt_name AS receiptName, source_filename AS sourceFilename,
                   source_content_type AS sourceContentType, notes, internal_notes AS internalNotes,
                   ocr_json AS ocrJson, confirmed_by AS confirmedBy, confirmed_at AS confirmedAt,
                   discarded_at AS discardedAt, created_at AS createdAt, updated_at AS updatedAt
            FROM invoice_scan_session
            WHERE id = #{id} AND vendor_id = #{vendorId} AND discarded_at IS NULL
            LIMIT 1
            """)
    InvoiceScanSessionEntity findOwned(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("""
            SELECT id
            FROM invoice_scan_session
            WHERE vendor_id = #{vendorId}
              AND discarded_at IS NULL
              AND invoice_number = #{invoiceNumber}
              AND (
                (#{supplierId,jdbcType=BIGINT} IS NOT NULL AND supplier_id = #{supplierId,jdbcType=BIGINT})
                OR (#{supplierAbn,jdbcType=VARCHAR} IS NOT NULL AND supplier_abn = #{supplierAbn,jdbcType=VARCHAR})
              )
              AND status IN ('draft', 'matched', 'po_created', 'received')
            ORDER BY id DESC
            LIMIT 5
            """)
    List<Long> findDuplicateIds(@Param("vendorId") long vendorId,
                                @Param("invoiceNumber") String invoiceNumber,
                                @Param("supplierId") Long supplierId,
                                @Param("supplierAbn") String supplierAbn);

    @Insert("""
            INSERT INTO invoice_scan_session (
              vendor_id, created_by, status, source_type, supplier_name, supplier_abn, invoice_number,
              invoice_date, due_date, total_payable, gst_included, supplier_id, outlet_id,
              source_filename, source_content_type, notes, internal_notes, ocr_json
            ) VALUES (
              #{vendorId}, #{createdBy}, #{status}, #{sourceType}, #{supplierName}, #{supplierAbn}, #{invoiceNumber},
              #{invoiceDate}, #{dueDate}, #{totalPayable}, #{gstIncluded}, #{supplierId}, #{outletId},
              #{sourceFilename}, #{sourceContentType}, #{notes}, #{internalNotes}, #{ocrJson}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(InvoiceScanSessionEntity session);

    @Update("""
            UPDATE invoice_scan_session
            SET status = #{status},
                supplier_name = #{supplierName},
                supplier_abn = #{supplierAbn},
                invoice_number = #{invoiceNumber},
                invoice_date = #{invoiceDate},
                due_date = #{dueDate},
                total_payable = #{totalPayable},
                gst_included = #{gstIncluded},
                supplier_id = #{supplierId},
                outlet_id = #{outletId},
                purchase_order_id = #{purchaseOrderId},
                purchase_order_name = #{purchaseOrderName},
                receipt_id = #{receiptId},
                receipt_name = #{receiptName},
                notes = #{notes},
                internal_notes = #{internalNotes},
                confirmed_by = #{confirmedBy},
                confirmed_at = #{confirmedAt},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND vendor_id = #{vendorId}
            """)
    int update(InvoiceScanSessionEntity session);

    @Update("""
            UPDATE invoice_scan_session
            SET discarded_at = CURRENT_TIMESTAMP, status = 'discarded', updated_at = CURRENT_TIMESTAMP
            WHERE id = #{id} AND vendor_id = #{vendorId} AND status IN ('draft', 'matched', 'failed')
            """)
    int softDelete(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("""
            SELECT id, session_id AS sessionId, line_index AS lineIndex, description, brand,
                   pack_qty AS packQty, qty_cases AS qtyCases, unit_price AS unitPrice, line_total AS lineTotal,
                   product_id AS productId, product_name AS productName,
                   match_status AS matchStatus, confidence
            FROM invoice_scan_line
            WHERE session_id = #{sessionId}
            ORDER BY line_index ASC, id ASC
            """)
    List<InvoiceScanLineEntity> listLines(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO invoice_scan_line (
              session_id, line_index, description, brand, pack_qty, qty_cases, unit_price, line_total,
              product_id, product_name, match_status, confidence
            ) VALUES (
              #{sessionId}, #{lineIndex}, #{description}, #{brand}, #{packQty}, #{qtyCases}, #{unitPrice}, #{lineTotal},
              #{productId}, #{productName}, #{matchStatus}, #{confidence}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertLine(InvoiceScanLineEntity line);

    @Delete("DELETE FROM invoice_scan_line WHERE session_id = #{sessionId}")
    int deleteLines(@Param("sessionId") long sessionId);

    @Select("""
            SELECT supplier_id
            FROM invoice_supplier_abn_map
            WHERE vendor_id = #{vendorId} AND supplier_abn = #{supplierAbn}
            LIMIT 1
            """)
    Long findMappedSupplier(@Param("vendorId") long vendorId, @Param("supplierAbn") String supplierAbn);

    @Insert("""
            INSERT INTO invoice_supplier_abn_map (vendor_id, supplier_abn, supplier_id, supplier_name)
            VALUES (#{vendorId}, #{supplierAbn}, #{supplierId}, #{supplierName})
            ON CONFLICT (vendor_id, supplier_abn) DO UPDATE SET
              supplier_id = EXCLUDED.supplier_id,
              supplier_name = EXCLUDED.supplier_name,
              updated_at = CURRENT_TIMESTAMP
            """)
    int upsertAbnMap(@Param("vendorId") long vendorId,
                     @Param("supplierAbn") String supplierAbn,
                     @Param("supplierId") long supplierId,
                     @Param("supplierName") String supplierName);

    @Select("SELECT EXISTS (SELECT 1 FROM supplier s JOIN outlet o ON o.id=s.outlet_id "
            + "WHERE s.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL AND s.deleted_at IS NULL)")
    boolean supplierBelongsToVendor(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("SELECT EXISTS (SELECT 1 FROM outlet WHERE id=#{id} AND vendor_id=#{vendorId} AND deleted_at IS NULL)")
    boolean outletBelongsToVendor(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("SELECT EXISTS (SELECT 1 FROM product p JOIN outlet o ON o.id=p.outlet_id "
            + "WHERE p.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL AND p.deleted_at IS NULL)")
    boolean productBelongsToVendor(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("SELECT EXISTS (SELECT 1 FROM purchase_order po JOIN outlet o ON o.id=po.outlet_id "
            + "WHERE po.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL)")
    boolean purchaseOrderBelongsToVendor(@Param("id") long id, @Param("vendorId") long vendorId);

    @Select("SELECT EXISTS (SELECT 1 FROM purchase_receipt r WHERE r.id=#{receiptId} "
            + "AND r.order_id=#{purchaseOrderId} AND r.vendor_id=#{vendorId})")
    boolean receiptBelongsToPurchaseOrder(@Param("receiptId") long receiptId,
                                          @Param("purchaseOrderId") long purchaseOrderId,
                                          @Param("vendorId") long vendorId);
}

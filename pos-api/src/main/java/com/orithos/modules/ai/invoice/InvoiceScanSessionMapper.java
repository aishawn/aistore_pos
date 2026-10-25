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
                   gst_included AS gstIncluded, odoo_supplier_id AS odooSupplierId, odoo_outlet_id AS odooOutletId,
                   odoo_po_id AS odooPoId, odoo_po_name AS odooPoName, odoo_picking_id AS odooPickingId,
                   odoo_picking_name AS odooPickingName, source_filename AS sourceFilename,
                   source_content_type AS sourceContentType, notes, internal_notes AS internalNotes,
                   ocr_json AS ocrJson, confirmed_by AS confirmedBy, confirmed_at AS confirmedAt,
                   discarded_at AS discardedAt, created_at AS createdAt, updated_at AS updatedAt
            FROM invoice_scan_session
            WHERE vendor_id = #{vendorId}
              AND discarded_at IS NULL
              AND (#{status} IS NULL OR status = #{status})
              AND (
                #{query} IS NULL
                OR supplier_name LIKE CONCAT('%', #{query}, '%')
                OR invoice_number LIKE CONCAT('%', #{query}, '%')
                OR supplier_abn LIKE CONCAT('%', #{query}, '%')
              )
            ORDER BY updated_at DESC
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
              AND (#{status} IS NULL OR status = #{status})
              AND (
                #{query} IS NULL
                OR supplier_name LIKE CONCAT('%', #{query}, '%')
                OR invoice_number LIKE CONCAT('%', #{query}, '%')
                OR supplier_abn LIKE CONCAT('%', #{query}, '%')
              )
            """)
    long count(@Param("vendorId") long vendorId,
               @Param("status") String status,
               @Param("query") String query);

    @Select("""
            SELECT id, vendor_id AS vendorId, created_by AS createdBy, status, source_type AS sourceType,
                   supplier_name AS supplierName, supplier_abn AS supplierAbn, invoice_number AS invoiceNumber,
                   invoice_date AS invoiceDate, due_date AS dueDate, total_payable AS totalPayable,
                   gst_included AS gstIncluded, odoo_supplier_id AS odooSupplierId, odoo_outlet_id AS odooOutletId,
                   odoo_po_id AS odooPoId, odoo_po_name AS odooPoName, odoo_picking_id AS odooPickingId,
                   odoo_picking_name AS odooPickingName, source_filename AS sourceFilename,
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
                (#{odooSupplierId} IS NOT NULL AND odoo_supplier_id = #{odooSupplierId})
                OR (#{supplierAbn} IS NOT NULL AND supplier_abn = #{supplierAbn})
              )
              AND status IN ('draft', 'matched', 'po_created', 'received')
            ORDER BY id DESC
            LIMIT 5
            """)
    List<Long> findDuplicateIds(@Param("vendorId") long vendorId,
                                @Param("invoiceNumber") String invoiceNumber,
                                @Param("odooSupplierId") Long odooSupplierId,
                                @Param("supplierAbn") String supplierAbn);

    @Insert("""
            INSERT INTO invoice_scan_session (
              vendor_id, created_by, status, source_type, supplier_name, supplier_abn, invoice_number,
              invoice_date, due_date, total_payable, gst_included, odoo_supplier_id, odoo_outlet_id,
              source_filename, source_content_type, notes, internal_notes, ocr_json
            ) VALUES (
              #{vendorId}, #{createdBy}, #{status}, #{sourceType}, #{supplierName}, #{supplierAbn}, #{invoiceNumber},
              #{invoiceDate}, #{dueDate}, #{totalPayable}, #{gstIncluded}, #{odooSupplierId}, #{odooOutletId},
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
                odoo_supplier_id = #{odooSupplierId},
                odoo_outlet_id = #{odooOutletId},
                odoo_po_id = #{odooPoId},
                odoo_po_name = #{odooPoName},
                odoo_picking_id = #{odooPickingId},
                odoo_picking_name = #{odooPickingName},
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
                   odoo_product_id AS odooProductId, odoo_product_name AS odooProductName,
                   match_status AS matchStatus, confidence
            FROM invoice_scan_line
            WHERE session_id = #{sessionId}
            ORDER BY line_index ASC, id ASC
            """)
    List<InvoiceScanLineEntity> listLines(@Param("sessionId") long sessionId);

    @Insert("""
            INSERT INTO invoice_scan_line (
              session_id, line_index, description, brand, pack_qty, qty_cases, unit_price, line_total,
              odoo_product_id, odoo_product_name, match_status, confidence
            ) VALUES (
              #{sessionId}, #{lineIndex}, #{description}, #{brand}, #{packQty}, #{qtyCases}, #{unitPrice}, #{lineTotal},
              #{odooProductId}, #{odooProductName}, #{matchStatus}, #{confidence}
            )
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertLine(InvoiceScanLineEntity line);

    @Delete("DELETE FROM invoice_scan_line WHERE session_id = #{sessionId}")
    int deleteLines(@Param("sessionId") long sessionId);

    @Select("""
            SELECT odoo_supplier_id
            FROM invoice_supplier_abn_map
            WHERE vendor_id = #{vendorId} AND supplier_abn = #{supplierAbn}
            LIMIT 1
            """)
    Long findMappedSupplier(@Param("vendorId") long vendorId, @Param("supplierAbn") String supplierAbn);

    @Insert("""
            INSERT INTO invoice_supplier_abn_map (vendor_id, supplier_abn, odoo_supplier_id, supplier_name)
            VALUES (#{vendorId}, #{supplierAbn}, #{odooSupplierId}, #{supplierName})
            ON CONFLICT (vendor_id, supplier_abn) DO UPDATE SET
              odoo_supplier_id = EXCLUDED.odoo_supplier_id,
              supplier_name = EXCLUDED.supplier_name,
              updated_at = CURRENT_TIMESTAMP
            """)
    int upsertAbnMap(@Param("vendorId") long vendorId,
                     @Param("supplierAbn") String supplierAbn,
                     @Param("odooSupplierId") long odooSupplierId,
                     @Param("supplierName") String supplierName);
}

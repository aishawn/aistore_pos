package com.orithos.modules.supplychain;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface SupplyChainMapper {

    @Select("""
            SELECT p.id AS product_id, p.name AS product_name, p.case_quantity,
                   p.core_supplier_id,
                   COALESCE(pi.quantity, 0) AS current_stock,
                   COALESCE(pi.on_order, 0) AS incoming_stock,
                   COALESCE(pi.reorder_level, 0) AS reorder_level,
                   COALESCE(pc.last_cost, pc.cost, p.cost) AS last_cost
            FROM product p
            LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.outlet_id = #{outletId}
            LEFT JOIN product_cost pc ON pc.product_id = p.id AND pc.outlet_id = #{outletId}
            WHERE p.deleted_at IS NULL
              AND p.status = 'ACTIVE'
              AND p.track_inventory = 1
              AND p.outlet_id = #{outletId}
            """)
    List<SupplyChainRows.DemandRow> listDemand(@Param("outletId") long outletId);

    @Select("""
            SELECT si.product_id AS product_id, COALESCE(SUM(si.quantity), 0) AS qty
            FROM sale_item si
            JOIN sale s ON s.id = si.sale_id
            WHERE s.outlet_id = #{outletId}
              AND si.product_id IS NOT NULL
              AND s.created_at >= #{from}
              AND s.created_at < #{to}
              AND s.status NOT IN ('VOIDED', 'PARKED', 'CANCELLED', 'VOID')
            GROUP BY si.product_id
            """)
    List<SupplyChainRows.SalesRow> listSales(@Param("outletId") long outletId,
                                             @Param("from") LocalDateTime from,
                                             @Param("to") LocalDateTime to);

    @Select("""
            SELECT ps.product_id, ps.supplier_id, ps.code AS supplier_sku, ps.minimum_order_quantity AS moq
            FROM product_supplier ps
            JOIN supplier s ON s.id = ps.supplier_id AND s.deleted_at IS NULL
            WHERE ps.outlet_id = #{outletId}
            """)
    List<SupplyChainRows.LinkRow> listLinks(@Param("outletId") long outletId);

    @Select("""
            SELECT s.id, s.name, c.email, COALESCE(s.freight_fixed_cost_per_case, 0) AS freight_per_case
            FROM supplier s
            LEFT JOIN contact c ON c.id = s.contact_id
            WHERE s.deleted_at IS NULL AND s.outlet_id = #{outletId}
            """)
    List<SupplyChainRows.SupplierRow> listSuppliers(@Param("outletId") long outletId);

    @Select("""
            SELECT id, product_id, supplier_id, supplier_sku, base_price, case_size, source
            FROM sc_supplier_price
            WHERE outlet_id = #{outletId}
              AND effective_from <= #{today}
              AND (effective_to IS NULL OR effective_to >= #{today})
            ORDER BY effective_from DESC, id DESC
            """)
    List<SupplyChainRows.PriceRow> listActivePrices(@Param("outletId") long outletId, @Param("today") LocalDate today);

    @Select("""
            SELECT id, supplier_id, name, deal_type, buy_quantity, free_quantity, discount_percent,
                   discount_amount, eligible_products, requires_rep, mix_match, valid_from, valid_to
            FROM sc_supplier_deal
            WHERE outlet_id = #{outletId}
              AND (valid_from IS NULL OR valid_from <= #{today})
              AND (valid_to IS NULL OR valid_to >= #{today})
            """)
    List<SupplyChainRows.DealRow> listActiveDeals(@Param("outletId") long outletId, @Param("today") LocalDate today);

    @Select("""
            SELECT id, supplier_id, priority, switch_threshold, channel
            FROM sc_store_preference
            WHERE outlet_id = #{outletId}
            """)
    List<SupplyChainRows.PrefRow> listPrefs(@Param("outletId") long outletId);

    @Select("""
            SELECT id, product_id, supplier_mode, supplier_id
            FROM sc_product_rule
            WHERE outlet_id = #{outletId}
            """)
    List<SupplyChainRows.RuleRow> listRules(@Param("outletId") long outletId);

    @Select("""
            SELECT id, event_date, name, demand_adjustment
            FROM sc_calendar_event
            WHERE outlet_id = #{outletId}
              AND event_date >= #{from}
              AND event_date < #{to}
            """)
    List<SupplyChainRows.EventRow> listEvents(@Param("outletId") long outletId,
                                              @Param("from") LocalDate from,
                                              @Param("to") LocalDate to);

    @Select("SELECT id FROM sc_purchase_plan WHERE outlet_id = #{outletId} AND week_start = #{weekStart}")
    Long findPlanId(@Param("outletId") long outletId, @Param("weekStart") LocalDate weekStart);

    @Select("SELECT COUNT(*) FROM sc_purchase_line WHERE plan_id = #{planId} AND status = 'ORDERED'")
    int countOrdered(@Param("planId") long planId);

    @Select("SELECT * FROM sc_purchase_plan WHERE id = #{id}")
    SupplyChainRows.PlanRow findPlan(@Param("id") long id);

    @Select("SELECT * FROM sc_purchase_line WHERE plan_id = #{planId} ORDER BY line_cost DESC, product_name")
    List<SupplyChainRows.LineRow> listLines(@Param("planId") long planId);

    @Select("SELECT * FROM sc_purchase_line WHERE id = #{id}")
    SupplyChainRows.LineRow findLine(@Param("id") long id);

    @Select("SELECT * FROM sc_email_draft WHERE plan_id = #{planId} ORDER BY supplier_name")
    List<SupplyChainRows.DraftRow> listDrafts(@Param("planId") long planId);

    @Select("SELECT * FROM sc_email_draft WHERE id = #{id}")
    SupplyChainRows.DraftRow findDraft(@Param("id") long id);

    @Delete("DELETE FROM sc_email_draft WHERE plan_id = #{planId}")
    int deleteDrafts(@Param("planId") long planId);

    @Delete("DELETE FROM sc_purchase_line WHERE plan_id = #{planId}")
    int deleteLines(@Param("planId") long planId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_purchase_plan
              (outlet_id, week_start, week_end, status, product_count, total_units,
               estimated_spend, estimated_saving, holiday_note)
            VALUES
              (#{outletId}, #{weekStart}, #{weekEnd}, #{status}, #{productCount}, #{totalUnits},
               #{estimatedSpend}, #{estimatedSaving}, #{holidayNote})
            """)
    int insertPlan(SupplyChainRows.PlanRow row);

    @Update("""
            UPDATE sc_purchase_plan
            SET status = #{status}, product_count = #{productCount}, total_units = #{totalUnits},
                estimated_spend = #{estimatedSpend}, estimated_saving = #{estimatedSaving},
                holiday_note = #{holidayNote}, week_end = #{weekEnd}, generated_at = NOW()
            WHERE id = #{id}
            """)
    int updatePlan(SupplyChainRows.PlanRow row);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_purchase_line
              (plan_id, outlet_id, product_id, product_name, supplier_id, supplier_name, supplier_sku,
               channel, last_week_sales, current_stock, incoming_stock, expected_demand, safety_stock,
               order_qty, case_qty, case_size, unit_cost, line_cost, saving, confidence, unusual,
               reason, decision, comparison_json, status, order_id)
            VALUES
              (#{planId}, #{outletId}, #{productId}, #{productName}, #{supplierId}, #{supplierName}, #{supplierSku},
               #{channel}, #{lastWeekSales}, #{currentStock}, #{incomingStock}, #{expectedDemand}, #{safetyStock},
               #{orderQty}, #{caseQty}, #{caseSize}, #{unitCost}, #{lineCost}, #{saving}, #{confidence},
               CASE WHEN #{unusual} THEN 1 ELSE 0 END,
               #{reason}, #{decision}, #{comparisonJson}, #{status}, #{orderId})
            """)
    int insertLine(SupplyChainRows.LineRow row);

    @Insert("""
            <script>
            INSERT INTO sc_purchase_line
              (plan_id, outlet_id, product_id, product_name, supplier_id, supplier_name, supplier_sku,
               channel, last_week_sales, current_stock, incoming_stock, expected_demand, safety_stock,
               order_qty, case_qty, case_size, unit_cost, line_cost, saving, confidence, unusual,
               reason, decision, comparison_json, status, order_id)
            VALUES
            <foreach collection="rows" item="row" separator=",">
              (#{row.planId}, #{row.outletId}, #{row.productId}, #{row.productName}, #{row.supplierId},
               #{row.supplierName}, #{row.supplierSku}, #{row.channel}, #{row.lastWeekSales}, #{row.currentStock},
               #{row.incomingStock}, #{row.expectedDemand}, #{row.safetyStock}, #{row.orderQty}, #{row.caseQty},
               #{row.caseSize}, #{row.unitCost}, #{row.lineCost}, #{row.saving}, #{row.confidence},
               CASE WHEN #{row.unusual} THEN 1 ELSE 0 END,
               #{row.reason}, #{row.decision}, #{row.comparisonJson}, #{row.status}, #{row.orderId})
            </foreach>
            </script>
            """)
    int insertLines(@Param("rows") List<SupplyChainRows.LineRow> rows);

    @Update("UPDATE sc_purchase_line SET status = #{status} WHERE id = #{id} AND outlet_id = #{outletId}")
    int updateLineStatus(@Param("id") long id, @Param("outletId") long outletId, @Param("status") String status);

    @Update("""
            UPDATE sc_purchase_line
            SET status = 'ORDERED', order_id = #{orderId}
            WHERE id = #{id} AND outlet_id = #{outletId}
            """)
    int markLineOrdered(@Param("id") long id, @Param("outletId") long outletId, @Param("orderId") long orderId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_email_draft
              (plan_id, outlet_id, supplier_id, supplier_name, to_email, subject, body, status, sku_count)
            VALUES
              (#{planId}, #{outletId}, #{supplierId}, #{supplierName}, #{toEmail}, #{subject}, #{body}, #{status}, #{skuCount})
            """)
    int insertDraft(SupplyChainRows.DraftRow row);

    @Update("UPDATE sc_email_draft SET status = 'REVIEWED' WHERE id = #{id} AND outlet_id = #{outletId}")
    int reviewDraft(@Param("id") long id, @Param("outletId") long outletId);

    @Select("""
            SELECT p.id, p.product_id, pr.name AS product_name, p.supplier_id, s.name AS supplier_name,
                   p.supplier_sku, p.base_price, p.case_size, p.effective_from, p.effective_to, p.source
            FROM sc_supplier_price p
            JOIN product pr ON pr.id = p.product_id
            JOIN supplier s ON s.id = p.supplier_id
            WHERE p.outlet_id = #{outletId}
            ORDER BY p.id DESC
            LIMIT 200
            """)
    List<SupplyChainRows.PriceRow> listPrices(@Param("outletId") long outletId);

    @Select("""
            SELECT d.id, d.supplier_id, s.name AS supplier_name, d.name, d.deal_type, d.buy_quantity,
                   d.free_quantity, d.discount_percent, d.discount_amount, d.eligible_products,
                   d.requires_rep, d.mix_match, d.valid_from, d.valid_to
            FROM sc_supplier_deal d
            JOIN supplier s ON s.id = d.supplier_id
            WHERE d.outlet_id = #{outletId}
            ORDER BY d.id DESC
            LIMIT 200
            """)
    List<SupplyChainRows.DealRow> listDeals(@Param("outletId") long outletId);

    @Select("""
            SELECT p.id, p.supplier_id, s.name AS supplier_name, p.priority, p.switch_threshold, p.channel
            FROM sc_store_preference p
            JOIN supplier s ON s.id = p.supplier_id
            WHERE p.outlet_id = #{outletId}
            ORDER BY p.priority, s.name
            """)
    List<SupplyChainRows.PrefRow> listPrefDetails(@Param("outletId") long outletId);

    @Select("""
            SELECT r.id, r.product_id, p.name AS product_name, r.supplier_mode, r.supplier_id, s.name AS supplier_name
            FROM sc_product_rule r
            JOIN product p ON p.id = r.product_id
            LEFT JOIN supplier s ON s.id = r.supplier_id
            WHERE r.outlet_id = #{outletId}
            ORDER BY p.name
            """)
    List<SupplyChainRows.RuleRow> listRuleDetails(@Param("outletId") long outletId);

    @Select("""
            SELECT id, event_date, name, demand_adjustment
            FROM sc_calendar_event
            WHERE outlet_id = #{outletId}
            ORDER BY event_date
            """)
    List<SupplyChainRows.EventRow> listAllEvents(@Param("outletId") long outletId);

    @Select("SELECT COUNT(*) FROM supplier WHERE id = #{id} AND deleted_at IS NULL AND outlet_id = #{outletId}")
    int countSupplier(@Param("id") long id, @Param("outletId") long outletId);

    @Select("SELECT COUNT(*) FROM product WHERE id = #{id} AND deleted_at IS NULL AND outlet_id = #{outletId}")
    int countProduct(@Param("id") long id, @Param("outletId") long outletId);

    @Insert("""
            INSERT INTO sc_store_preference (outlet_id, supplier_id, priority, switch_threshold, channel)
            VALUES (#{outletId}, #{supplierId}, #{priority}, #{switchThreshold}, #{channel})
            ON CONFLICT (outlet_id, supplier_id) DO UPDATE SET
              priority = EXCLUDED.priority,
              switch_threshold = EXCLUDED.switch_threshold,
              channel = EXCLUDED.channel
            """)
    int upsertPref(@Param("outletId") long outletId,
                   @Param("supplierId") long supplierId,
                   @Param("priority") int priority,
                   @Param("switchThreshold") java.math.BigDecimal switchThreshold,
                   @Param("channel") String channel);

    @Delete("DELETE FROM sc_store_preference WHERE id = #{id} AND outlet_id = #{outletId}")
    int deletePref(@Param("id") long id, @Param("outletId") long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_supplier_price
              (outlet_id, product_id, supplier_id, supplier_sku, base_price, case_size, currency,
               effective_from, effective_to, source)
            VALUES
              (#{outletId}, #{productId}, #{supplierId}, #{supplierSku}, #{basePrice}, #{caseSize}, 'AUD',
               #{effectiveFrom}, #{effectiveTo}, #{source})
            """)
    int insertPrice(SupplyChainRows.PriceRow row);

    @Delete("DELETE FROM sc_supplier_price WHERE id = #{id} AND outlet_id = #{outletId}")
    int deletePrice(@Param("id") long id, @Param("outletId") long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_supplier_deal
              (outlet_id, supplier_id, name, deal_type, buy_quantity, free_quantity, discount_percent,
               discount_amount, eligible_products, requires_rep, mix_match, valid_from, valid_to)
            VALUES
              (#{outletId}, #{supplierId}, #{name}, #{dealType}, #{buyQuantity}, #{freeQuantity}, #{discountPercent},
               #{discountAmount}, #{eligibleProducts}, #{requiresRep}, #{mixMatch}, #{validFrom}, #{validTo})
            """)
    int insertDeal(SupplyChainRows.DealRow row);

    @Delete("DELETE FROM sc_supplier_deal WHERE id = #{id} AND outlet_id = #{outletId}")
    int deleteDeal(@Param("id") long id, @Param("outletId") long outletId);

    @Insert("""
            INSERT INTO sc_product_rule (outlet_id, product_id, supplier_mode, supplier_id)
            VALUES (#{outletId}, #{productId}, #{supplierMode}, #{supplierId})
            ON CONFLICT (outlet_id, product_id) DO UPDATE SET supplier_mode = EXCLUDED.supplier_mode, supplier_id = EXCLUDED.supplier_id
            """)
    int upsertRule(@Param("outletId") long outletId,
                   @Param("productId") long productId,
                   @Param("supplierMode") String supplierMode,
                   @Param("supplierId") Long supplierId);

    @Delete("DELETE FROM sc_product_rule WHERE id = #{id} AND outlet_id = #{outletId}")
    int deleteRule(@Param("id") long id, @Param("outletId") long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO sc_calendar_event (outlet_id, event_date, name, demand_adjustment)
            VALUES (#{outletId}, #{eventDate}, #{name}, #{demandAdjustment})
            """)
    int insertEvent(SupplyChainRows.EventRow row);

    @Delete("DELETE FROM sc_calendar_event WHERE id = #{id} AND outlet_id = #{outletId}")
    int deleteEvent(@Param("id") long id, @Param("outletId") long outletId);
}

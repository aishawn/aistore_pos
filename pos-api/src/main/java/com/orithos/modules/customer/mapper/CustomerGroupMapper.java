package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.CustomerGroup;
import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface CustomerGroupMapper {

    @Select("SELECT * FROM customer_group WHERE deleted_at IS NULL AND outlet_id=#{outletId} ORDER BY created_at DESC, id DESC")
    List<CustomerGroup> findAll(@Param("outletId") Long outletId);

    @Select("""
            SELECT g.*, (
                SELECT COUNT(*)
                FROM customer c
                WHERE c.customer_group_id = g.id AND c.deleted_at IS NULL
            ) AS customer_count
            FROM customer_group g
            WHERE g.deleted_at IS NULL AND g.outlet_id = #{outletId}
              AND (#{name} IS NULL OR g.name LIKE CONCAT('%', #{name}, '%') ESCAPE '!')
            ORDER BY g.created_at DESC, g.id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<CustomerGroup> page(@Param("name") String name, @Param("outletId") Long outletId, @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM customer_group WHERE deleted_at IS NULL AND outlet_id=#{outletId} "
            + "AND (#{name} IS NULL OR name LIKE CONCAT('%', #{name}, '%') ESCAPE '!')")
    long count(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("SELECT outlet_id FROM customer_group WHERE id=#{id} AND deleted_at IS NULL")
    Long findOutletId(@Param("id") Long id);

    @Select("SELECT * FROM customer_group WHERE id=#{id} AND outlet_id=#{outletId} AND deleted_at IS NULL")
    CustomerGroup findByIdAndOutlet(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT * FROM customer_group WHERE id=#{id} AND deleted_at IS NULL")
    CustomerGroup findById(Long id);

    @Select("SELECT * FROM customer_group WHERE deleted_at IS NULL AND outlet_id=#{outletId} "
            + "AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})) LIMIT 1")
    CustomerGroup findActiveByName(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM customer_group WHERE deleted_at IS NULL AND outlet_id=#{outletId} "
            + "AND LOWER(TRIM(name)) = LOWER(TRIM(#{name}))")
    long countActiveByName(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM customer_group WHERE deleted_at IS NULL AND outlet_id=#{outletId} "
            + "AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})) AND id <> #{excludeId}")
    long countActiveByNameExcluding(@Param("name") String name, @Param("excludeId") Long excludeId, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO customer_group (name, default_receipt_id, email_receipt_id, "
            + "payment_receipt_id, statement_template_id, price_list_id, loyalty_enabled, "
            + "disable_promotions, allow_account_sales, account_limit, auto_print_receipt, "
            + "auto_print_parked_receipt, auto_email_receipt, auto_print_payment_receipt, "
            + "require_order_reference, credit_terms, outlet_id) "
            + "VALUES (#{name}, #{defaultReceiptId}, #{emailReceiptId}, "
            + "#{paymentReceiptId}, #{statementTemplateId}, #{priceListId}, #{loyaltyEnabled}, "
            + "#{disablePromotions}, #{allowAccountSales}, #{accountLimit}, #{autoPrintReceipt}, "
            + "#{autoPrintParkedReceipt}, #{autoEmailReceipt}, #{autoPrintPaymentReceipt}, "
            + "#{requireOrderReference}, #{creditTerms}, #{outletId})")
    int insert(CustomerGroup g);

    @Update("UPDATE customer_group SET name=#{name}, default_receipt_id=#{defaultReceiptId}, "
            + "email_receipt_id=#{emailReceiptId}, payment_receipt_id=#{paymentReceiptId}, "
            + "statement_template_id=#{statementTemplateId}, price_list_id=#{priceListId}, "
            + "loyalty_enabled=#{loyaltyEnabled}, disable_promotions=#{disablePromotions}, "
            + "allow_account_sales=#{allowAccountSales}, account_limit=#{accountLimit}, "
            + "auto_print_receipt=#{autoPrintReceipt}, auto_print_parked_receipt=#{autoPrintParkedReceipt}, "
            + "auto_email_receipt=#{autoEmailReceipt}, auto_print_payment_receipt=#{autoPrintPaymentReceipt}, "
            + "require_order_reference=#{requireOrderReference}, credit_terms=#{creditTerms} "
            + "WHERE id=#{id} AND outlet_id=#{outletId}")
    int update(CustomerGroup g);

    @Update("UPDATE customer_group SET deleted_at = NOW() WHERE id=#{id} AND outlet_id=#{outletId}")
    int softDelete(@Param("id") Long id, @Param("outletId") Long outletId);
}

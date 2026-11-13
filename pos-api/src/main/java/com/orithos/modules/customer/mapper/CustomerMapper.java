package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.Customer;
import com.orithos.modules.customer.CustomerDetail;
import com.orithos.modules.customer.CustomerExportRow;
import lombok.Data;
import org.apache.ibatis.annotations.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CustomerMapper {

    @Select("SELECT c.id, c.name, c.customer_group_id, c.loyalty_points, g.name AS customer_group_name "
            + "FROM customer c LEFT JOIN customer_group g ON g.id=c.customer_group_id "
            + "WHERE c.deleted_at IS NULL AND c.outlet_id=#{outletId} "
            + "AND c.outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL) "
            + "AND (CAST(#{name,jdbcType=VARCHAR} AS text) IS NULL OR c.name LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') "
            + "OR c.code LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') OR c.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%')) "
            + "ORDER BY c.name LIMIT 10")
    List<Customer> searchForSell(@Param("name") String name, @Param("vendorId") Long vendorId,
                                 @Param("outletId") Long outletId);

    @Select("""
        <script>
        SELECT c.id, c.name, c.first_name, c.last_name, c.code, c.company, c.business_number,
               c.birthday, c.allow_marketing_emails, c.email, c.phone, c.mobile,
               c.customer_group_id, c.loyalty_enabled, c.loyalty_points, c.price_list_id,
               c.account_limit,
               <choose>
                 <when test="asOfEnd != null">
                   (COALESCE((SELECT SUM(s.total_price) FROM sale s
                     WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED' AND s.created_at &lt; #{asOfEnd}), 0)
                   - COALESCE((SELECT SUM(cp.amount) FROM customer_payment cp
                     WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED' AND cp.timestamp &lt; #{asOfEnd}), 0))
                 </when>
                 <otherwise>c.current_owing</otherwise>
               </choose> AS current_owing,
               c.created_at,
               g.name AS customer_group_name
        FROM customer c LEFT JOIN customer_group g ON g.id = c.customer_group_id
        WHERE c.deleted_at IS NULL AND c.outlet_id = #{outletId}
          AND (CAST(#{name,jdbcType=VARCHAR} AS text) IS NULL OR c.name LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.code LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR EXISTS (SELECT 1 FROM customer_email ce
              WHERE ce.customer_id = c.id AND ce.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            ))
          <if test="filterGroups">
            AND (
            <trim prefixOverrides="OR">
              <if test="includeNoGroup">c.customer_group_id IS NULL</if>
              <if test="groupIds != null and groupIds.size() &gt; 0">
                OR c.customer_group_id IN
                <foreach collection="groupIds" item="gid" open="(" separator="," close=")">
                  #{gid}
                </foreach>
              </if>
            </trim>
            )
          </if>
          <if test="minOwing != null">
            AND (
              <choose>
                <when test="asOfEnd != null">
                  (COALESCE((SELECT SUM(s.total_price) FROM sale s
                    WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED' AND s.created_at &lt; #{asOfEnd}), 0)
                  - COALESCE((SELECT SUM(cp.amount) FROM customer_payment cp
                    WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED' AND cp.timestamp &lt; #{asOfEnd}), 0))
                </when>
                <otherwise>COALESCE(c.current_owing, 0)</otherwise>
              </choose>
            ) &gt;= #{minOwing}
          </if>
          <if test="maxOwing != null">
            AND (
              <choose>
                <when test="asOfEnd != null">
                  (COALESCE((SELECT SUM(s.total_price) FROM sale s
                    WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED' AND s.created_at &lt; #{asOfEnd}), 0)
                  - COALESCE((SELECT SUM(cp.amount) FROM customer_payment cp
                    WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED' AND cp.timestamp &lt; #{asOfEnd}), 0))
                </when>
                <otherwise>COALESCE(c.current_owing, 0)</otherwise>
              </choose>
            ) &lt;= #{maxOwing}
          </if>
          <if test="filterPriceList">
            <choose>
              <when test="noPriceList">AND c.price_list_id IS NULL</when>
              <otherwise>AND c.price_list_id = #{priceListId}</otherwise>
            </choose>
          </if>
        ORDER BY lower(c.name) COLLATE "C" ASC, c.id ASC LIMIT #{size} OFFSET #{offset}
        </script>
        """)
    List<Customer> page(@Param("name") String name,
                        @Param("groupIds") List<Long> groupIds,
                        @Param("includeNoGroup") boolean includeNoGroup,
                        @Param("filterGroups") boolean filterGroups,
                        @Param("priceListId") Long priceListId,
                        @Param("noPriceList") boolean noPriceList,
                        @Param("filterPriceList") boolean filterPriceList,
                        @Param("minOwing") BigDecimal minOwing,
                        @Param("maxOwing") BigDecimal maxOwing,
                        @Param("asOfEnd") LocalDateTime asOfEnd,
                        @Param("outletId") Long outletId,
                        @Param("size") int size,
                        @Param("offset") int offset);

    @Select("""
        <script>
        SELECT COUNT(*) FROM customer c WHERE c.deleted_at IS NULL AND c.outlet_id = #{outletId}
          AND (CAST(#{name,jdbcType=VARCHAR} AS text) IS NULL OR c.name LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.code LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR EXISTS (SELECT 1 FROM customer_email ce
              WHERE ce.customer_id = c.id AND ce.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            ))
          <if test="filterGroups">
            AND (
            <trim prefixOverrides="OR">
              <if test="includeNoGroup">c.customer_group_id IS NULL</if>
              <if test="groupIds != null and groupIds.size() &gt; 0">
                OR c.customer_group_id IN
                <foreach collection="groupIds" item="gid" open="(" separator="," close=")">
                  #{gid}
                </foreach>
              </if>
            </trim>
            )
          </if>
          <if test="minOwing != null">
            AND (
              <choose>
                <when test="asOfEnd != null">
                  (COALESCE((SELECT SUM(s.total_price) FROM sale s
                    WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED' AND s.created_at &lt; #{asOfEnd}), 0)
                  - COALESCE((SELECT SUM(cp.amount) FROM customer_payment cp
                    WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED' AND cp.timestamp &lt; #{asOfEnd}), 0))
                </when>
                <otherwise>COALESCE(c.current_owing, 0)</otherwise>
              </choose>
            ) &gt;= #{minOwing}
          </if>
          <if test="maxOwing != null">
            AND (
              <choose>
                <when test="asOfEnd != null">
                  (COALESCE((SELECT SUM(s.total_price) FROM sale s
                    WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED' AND s.created_at &lt; #{asOfEnd}), 0)
                  - COALESCE((SELECT SUM(cp.amount) FROM customer_payment cp
                    WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED' AND cp.timestamp &lt; #{asOfEnd}), 0))
                </when>
                <otherwise>COALESCE(c.current_owing, 0)</otherwise>
              </choose>
            ) &lt;= #{maxOwing}
          </if>
          <if test="filterPriceList">
            <choose>
              <when test="noPriceList">AND c.price_list_id IS NULL</when>
              <otherwise>AND c.price_list_id = #{priceListId}</otherwise>
            </choose>
          </if>
        </script>
        """)
    long count(@Param("name") String name,
               @Param("groupIds") List<Long> groupIds,
               @Param("includeNoGroup") boolean includeNoGroup,
               @Param("filterGroups") boolean filterGroups,
               @Param("priceListId") Long priceListId,
               @Param("noPriceList") boolean noPriceList,
               @Param("filterPriceList") boolean filterPriceList,
               @Param("minOwing") BigDecimal minOwing,
               @Param("maxOwing") BigDecimal maxOwing,
               @Param("asOfEnd") LocalDateTime asOfEnd,
               @Param("outletId") Long outletId);

    @Select("""
        <script>
        SELECT s.customer_id AS customer_id,
               COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) AS day,
               COALESCE(SUM(si.quantity), 0) AS quantity
        FROM sale s
        INNER JOIN sale_item si ON si.sale_id = s.id
        WHERE s.status = 'COMPLETED'
          AND s.refund_reason IS NULL
          AND s.customer_id IN
          <foreach collection="customerIds" item="id" open="(" separator="," close=")">#{id}</foreach>
          AND COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) &gt;= CAST(#{from} AS date)
          AND COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date)) &lt;= CAST(#{to} AS date)
        GROUP BY s.customer_id, COALESCE(s.business_date, CAST(s.local_sold_at AS date), CAST(s.created_at AS date))
        </script>
        """)
    List<CustomerDailyQuantity> salesQuantityByDay(@Param("customerIds") List<Long> customerIds,
                                                   @Param("from") String from,
                                                   @Param("to") String to);

    @Data
    class CustomerDailyQuantity {
        private Long customerId;
        private LocalDate day;
        private BigDecimal quantity;
    }

    @Select("SELECT outlet_id FROM customer WHERE id = #{id} AND deleted_at IS NULL")
    Long findOutletId(@Param("id") Long id);

    @Select("SELECT * FROM customer WHERE id = #{id}")
    Customer findById(Long id);

    @Select("""
        SELECT c.id, c.name, c.first_name, c.last_name, c.code, c.company, c.business_number,
               c.birthday, c.gender, c.email, c.phone, c.mobile, c.fax, c.allow_marketing_emails,
               c.invoice_message, c.comments, c.customer_group_id, c.override_customer_group,
               c.loyalty_enabled, c.loyalty_points, c.disable_promotions, c.price_list_id,
               c.account_limit, c.current_owing, c.created_at,
               c.billing_contact_id, c.delivery_contact_id,
               g.name AS customer_group_name,
               pl.name AS price_list_name,
               bc.address_street1 AS billing_street_address1,
               bc.address_street2 AS billing_street_address2,
               bc.address_suburb AS billing_suburb,
               bc.address_postcode AS billing_post_code,
               bc.address_region AS billing_region,
               bc.address_country AS billing_country,
               bc.website AS website,
               bc.twitter AS twitter,
               bc.facebook AS facebook,
               dc.address_street1 AS delivery_street_address1,
               dc.address_street2 AS delivery_street_address2,
               dc.address_suburb AS delivery_suburb,
               dc.address_postcode AS delivery_post_code,
               dc.address_region AS delivery_region,
               dc.address_country AS delivery_country
        FROM customer c
        LEFT JOIN customer_group g ON g.id = c.customer_group_id AND g.deleted_at IS NULL
        LEFT JOIN price_list pl ON pl.id = c.price_list_id
        LEFT JOIN contact bc ON bc.id = c.billing_contact_id
        LEFT JOIN contact dc ON dc.id = c.delivery_contact_id
        WHERE c.id = #{id} AND c.deleted_at IS NULL
        """)
    CustomerDetail findDetailById(Long id);

    @Select("""
        <script>
        SELECT c.id, c.name, c.first_name, c.last_name, c.code, c.company, c.business_number,
               c.birthday, c.gender, c.email, c.phone, c.mobile, c.fax, c.allow_marketing_emails,
               c.invoice_message, c.comments, c.loyalty_enabled, c.loyalty_rate, c.loyalty_points,
               c.disable_promotions, c.price_list_id, c.require_order_reference, c.account_limit,
               c.current_owing, c.created_at, c.updated_at,
               g.name AS customer_group_name
        FROM customer c
        LEFT JOIN customer_group g ON g.id = c.customer_group_id AND g.deleted_at IS NULL
        WHERE c.deleted_at IS NULL
          AND (CAST(#{name,jdbcType=VARCHAR} AS text) IS NULL OR c.name LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.code LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR c.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            OR EXISTS (SELECT 1 FROM customer_email ce
              WHERE ce.customer_id = c.id AND ce.email LIKE CONCAT('%', #{name,jdbcType=VARCHAR}, '%') ESCAPE '!'
            ))
          <if test="filterGroups">
            AND (
            <trim prefixOverrides="OR">
              <if test="includeNoGroup">c.customer_group_id IS NULL</if>
              <if test="groupIds != null and groupIds.size() &gt; 0">
                OR c.customer_group_id IN
                <foreach collection="groupIds" item="gid" open="(" separator="," close=")">
                  #{gid}
                </foreach>
              </if>
            </trim>
            )
          </if>
        ORDER BY c.created_at DESC, c.id DESC
        </script>
        """)
    List<CustomerExportRow> export(@Param("name") String name,
                                 @Param("groupIds") List<Long> groupIds,
                                 @Param("includeNoGroup") boolean includeNoGroup,
                                 @Param("filterGroups") boolean filterGroups);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO customer (name, first_name, last_name, code, company, business_number, birthday,
                              gender, email, phone, mobile, fax, allow_marketing_emails, invoice_message,
                              comments, customer_group_id, override_customer_group, billing_contact_id,
                              delivery_contact_id, loyalty_enabled, loyalty_points, disable_promotions,
                              price_list_id, account_limit, current_owing, outlet_id)
        VALUES (#{name}, #{firstName}, #{lastName}, #{code}, #{company}, #{businessNumber}, #{birthday},
                #{gender}, #{email}, #{phone}, #{mobile}, #{fax}, #{allowMarketingEmails}, #{invoiceMessage},
                #{comments}, #{customerGroupId}, #{overrideCustomerGroup}, #{billingContactId},
                #{deliveryContactId}, #{loyaltyEnabled}, #{loyaltyPoints}, #{disablePromotions},
                #{priceListId}, #{accountLimit}, #{currentOwing}, #{outletId})
        """)
    int insertDetail(CustomerDetail c);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO customer (name, first_name, last_name, code, company, email, phone, mobile,
                              customer_group_id, loyalty_enabled, loyalty_points, price_list_id,
                              account_limit, current_owing, birthday, allow_marketing_emails, outlet_id)
        VALUES (#{name}, #{firstName}, #{lastName}, #{code}, #{company}, #{email}, #{phone}, #{mobile},
                #{customerGroupId}, #{loyaltyEnabled}, #{loyaltyPoints}, #{priceListId},
                #{accountLimit}, #{currentOwing}, #{birthday}, #{allowMarketingEmails}, #{outletId})
        """)
    int insert(Customer c);

    @Update("""
        UPDATE customer SET name=#{name}, first_name=#{firstName}, last_name=#{lastName}, code=#{code},
               company=#{company}, business_number=#{businessNumber}, birthday=#{birthday}, gender=#{gender},
               email=#{email}, phone=#{phone}, mobile=#{mobile}, fax=#{fax},
               allow_marketing_emails=#{allowMarketingEmails}, invoice_message=#{invoiceMessage},
               comments=#{comments}, customer_group_id=#{customerGroupId},
               override_customer_group=#{overrideCustomerGroup}, billing_contact_id=#{billingContactId},
               delivery_contact_id=#{deliveryContactId}, loyalty_enabled=#{loyaltyEnabled},
               loyalty_points=#{loyaltyPoints}, disable_promotions=#{disablePromotions},
               price_list_id=#{priceListId}, account_limit=#{accountLimit}
        WHERE id=#{id}
        """)
    int updateDetail(CustomerDetail c);

    @Update("""
        UPDATE customer SET name=#{name}, first_name=#{firstName}, last_name=#{lastName}, code=#{code},
               company=#{company}, email=#{email}, phone=#{phone}, mobile=#{mobile},
               customer_group_id=#{customerGroupId}, price_list_id=#{priceListId}, account_limit=#{accountLimit}
        WHERE id=#{id}
        """)
    int update(Customer c);

    @Update("UPDATE customer SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);

    @Select("""
        SELECT COUNT(*) FROM customer
        WHERE deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(#{code}))
        """)
    long countActiveByCode(@Param("code") String code);

    @Select("""
        SELECT COUNT(*) FROM customer
        WHERE deleted_at IS NULL AND LOWER(TRIM(code)) = LOWER(TRIM(#{code})) AND id != #{excludeId}
        """)
    long countActiveByCodeExcluding(@Param("code") String code, @Param("excludeId") Long excludeId);

    @Update("UPDATE customer SET current_owing = #{owing} WHERE id = #{id}")
    int updateCurrentOwing(@Param("id") Long id, @Param("owing") java.math.BigDecimal owing);

    // ---- merge: reassign every reference from a source customer to the target ----
    @Update("UPDATE sale SET customer_id=#{target} WHERE customer_id=#{source}")
    int reassignSaleCustomer(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE customer_payment SET customer_id=#{target} WHERE customer_id=#{source}")
    int reassignPaymentCustomer(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE vendor_connection SET customer_id=#{target} WHERE customer_id=#{source}")
    int reassignVendorConnectionCustomer(@Param("target") Long target, @Param("source") Long source);
}

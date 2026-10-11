package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.CustomerStatementLine;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface CustomerStatementMapper {

    @Select("""
        <script>
        SELECT c.id
        FROM customer c
        WHERE c.deleted_at IS NULL
          AND (#{name} IS NULL OR c.name LIKE CONCAT('%', #{name}, '%') ESCAPE '!'
            OR c.code LIKE CONCAT('%', #{name}, '%') ESCAPE '!'
            OR c.email LIKE CONCAT('%', #{name}, '%') ESCAPE '!'
            OR EXISTS (
              SELECT 1 FROM customer_email ce
              WHERE ce.customer_id = c.id AND ce.email LIKE CONCAT('%', #{name}, '%') ESCAPE '!'
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
          AND (
            COALESCE(c.current_owing, 0) &lt;&gt; 0
            OR EXISTS (
              SELECT 1 FROM sale s
              WHERE s.customer_id = c.id AND s.status &lt;&gt; 'VOIDED'
                AND s.created_at &gt;= #{startAt} AND s.created_at &lt; #{endAt}
            )
            OR EXISTS (
              SELECT 1 FROM customer_payment cp
              WHERE cp.customer_id = c.id AND cp.status &lt;&gt; 'VOIDED'
                AND cp.timestamp &gt;= #{startAt} AND cp.timestamp &lt; #{endAt}
            )
          )
        ORDER BY c.created_at DESC, c.id DESC
        </script>
        """)
    List<Long> findCustomerIds(@Param("startAt") LocalDateTime startAt,
                               @Param("endAt") LocalDateTime endAt,
                               @Param("name") String name,
                               @Param("groupIds") List<Long> groupIds,
                               @Param("includeNoGroup") boolean includeNoGroup,
                               @Param("filterGroups") boolean filterGroups);

    @Select("""
        <script>
        SELECT COALESCE((
          SELECT SUM(s.total_price) FROM sale s
          WHERE s.customer_id = #{customerId} AND s.status &lt;&gt; 'VOIDED'
            AND s.created_at &lt; #{startAt}
        ), 0) - COALESCE((
          SELECT SUM(cp.amount) FROM customer_payment cp
          WHERE cp.customer_id = #{customerId} AND cp.status &lt;&gt; 'VOIDED'
            AND cp.timestamp &lt; #{startAt}
        ), 0)
        </script>
        """)
    BigDecimal openingBalance(@Param("customerId") Long customerId,
                              @Param("startAt") LocalDateTime startAt);

    @Select("""
        <script>
        SELECT occurred_at, description, amount, line_type FROM (
          SELECT s.created_at AS occurred_at,
                 CONCAT('Sale ', COALESCE(s.invoice_id, CAST(s.id AS CHAR))) AS description,
                 s.total_price AS amount,
                 'CHARGE' AS line_type
          FROM sale s
          WHERE s.customer_id = #{customerId} AND s.status &lt;&gt; 'VOIDED'
            AND s.created_at &gt;= #{startAt} AND s.created_at &lt; #{endAt}
          UNION ALL
          SELECT cp.timestamp AS occurred_at,
                 CASE
                   WHEN cp.reference IS NOT NULL AND cp.reference &lt;&gt; ''
                   THEN CONCAT('Payment (', cp.reference, ')')
                   ELSE 'Payment'
                 END AS description,
                 cp.amount AS amount,
                 'PAYMENT' AS line_type
          FROM customer_payment cp
          WHERE cp.customer_id = #{customerId} AND cp.status &lt;&gt; 'VOIDED'
            AND cp.timestamp &gt;= #{startAt} AND cp.timestamp &lt; #{endAt}
        ) t
        ORDER BY occurred_at, description
        </script>
        """)
    List<CustomerStatementLine> linesInPeriod(@Param("customerId") Long customerId,
                                              @Param("startAt") LocalDateTime startAt,
                                              @Param("endAt") LocalDateTime endAt);
}

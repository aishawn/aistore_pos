package com.orithos.tenant;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PlatformAdminAuditMapper {

    @Insert("""
            INSERT INTO platform_admin_audit
              (event_id, correlation_id, tenant_id, tenant_name, tenant_slug, actor_id, actor_username,
               action, target_type, target_id, reason, outcome, before_summary, created_at)
            VALUES
              (#{eventId}, #{correlationId}, #{tenantId}, #{tenantName}, #{tenantSlug}, #{actorId}, #{actorUsername},
               #{action}, #{targetType}, #{targetId}, #{reason}, 'IN_PROGRESS', #{beforeSummary}, #{createdAt})
            """)
    int insert(PlatformAdminAuditEntry entry);

    @Update("""
            UPDATE platform_admin_audit
            SET outcome=#{outcome}, after_summary=#{afterSummary}, error_code=#{errorCode},
                error_type=#{errorType}, completed_at=#{completedAt}
            WHERE event_id=#{eventId} AND outcome='IN_PROGRESS'
            """)
    int finish(@Param("eventId") String eventId,
               @Param("outcome") String outcome,
               @Param("afterSummary") String afterSummary,
               @Param("errorCode") Integer errorCode,
               @Param("errorType") String errorType,
               @Param("completedAt") LocalDateTime completedAt);

    @Select("""
            SELECT id, event_id, correlation_id, tenant_id, tenant_name, tenant_slug, actor_id, actor_username,
                   action, target_type, target_id, reason, outcome, before_summary, after_summary,
                   error_code, error_type, created_at, completed_at
            FROM platform_admin_audit
            WHERE tenant_id=#{tenantId}
            ORDER BY created_at DESC, id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<PlatformAdminAuditEntry> pageForTenant(@Param("tenantId") long tenantId,
                                                 @Param("size") int size,
                                                 @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM platform_admin_audit WHERE tenant_id=#{tenantId}")
    long countForTenant(@Param("tenantId") long tenantId);

    @Select("""
            <script>
            SELECT id, event_id, correlation_id, tenant_id, tenant_name, tenant_slug, actor_id, actor_username,
                   action, target_type, target_id, reason, outcome, before_summary, after_summary,
                   error_code, error_type, created_at, completed_at
            FROM platform_admin_audit
            WHERE 1=1
            <if test='tenantId != null'>AND tenant_id=#{tenantId}</if>
            <if test='query != null and query != ""'>
              AND (event_id LIKE CONCAT('%', #{query}, '%')
                OR correlation_id LIKE CONCAT('%', #{query}, '%')
                OR tenant_name LIKE CONCAT('%', #{query}, '%')
                OR tenant_slug LIKE CONCAT('%', #{query}, '%')
                OR actor_username LIKE CONCAT('%', #{query}, '%')
                OR action LIKE CONCAT('%', #{query}, '%')
                OR target_id LIKE CONCAT('%', #{query}, '%'))
            </if>
            <if test='action != null and action != ""'>AND action=#{action}</if>
            <if test='outcome != null and outcome != ""'>AND outcome=#{outcome}</if>
            <if test='from != null'>AND created_at &gt;=#{from}</if>
            <if test='to != null'>AND created_at &lt;=#{to}</if>
            ORDER BY created_at DESC, id DESC
            LIMIT #{size} OFFSET #{offset}
            </script>
            """)
    List<PlatformAdminAuditEntry> searchGlobal(@Param("tenantId") Long tenantId,
                                                @Param("query") String query,
                                                @Param("action") String action,
                                                @Param("outcome") String outcome,
                                                @Param("from") LocalDateTime from,
                                                @Param("to") LocalDateTime to,
                                                @Param("size") int size,
                                                @Param("offset") long offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM platform_admin_audit WHERE 1=1
            <if test='tenantId != null'>AND tenant_id=#{tenantId}</if>
            <if test='query != null and query != ""'>
              AND (event_id LIKE CONCAT('%', #{query}, '%')
                OR correlation_id LIKE CONCAT('%', #{query}, '%')
                OR tenant_name LIKE CONCAT('%', #{query}, '%')
                OR tenant_slug LIKE CONCAT('%', #{query}, '%')
                OR actor_username LIKE CONCAT('%', #{query}, '%')
                OR action LIKE CONCAT('%', #{query}, '%')
                OR target_id LIKE CONCAT('%', #{query}, '%'))
            </if>
            <if test='action != null and action != ""'>AND action=#{action}</if>
            <if test='outcome != null and outcome != ""'>AND outcome=#{outcome}</if>
            <if test='from != null'>AND created_at &gt;=#{from}</if>
            <if test='to != null'>AND created_at &lt;=#{to}</if>
            </script>
            """)
    long countGlobal(@Param("tenantId") Long tenantId,
                     @Param("query") String query,
                     @Param("action") String action,
                     @Param("outcome") String outcome,
                     @Param("from") LocalDateTime from,
                     @Param("to") LocalDateTime to);
}

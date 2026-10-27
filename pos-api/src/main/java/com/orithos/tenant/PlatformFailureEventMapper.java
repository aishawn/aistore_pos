package com.orithos.tenant;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PlatformFailureEventMapper {

    @org.apache.ibatis.annotations.Insert("""
            INSERT INTO platform_failure_event
              (event_id, fingerprint, correlation_id, environment, service, runtime_commit,
               tenant_id, tenant_name, tenant_slug, actor_id, actor_username, http_method,
               request_path, http_status, error_code, error_type, error_summary, duration_ms, occurred_at)
            VALUES
              (#{eventId}, #{fingerprint}, #{correlationId}, #{environment}, #{service}, #{runtimeCommit},
               #{tenantId}, #{tenantName}, #{tenantSlug}, #{actorId}, #{actorUsername}, #{httpMethod},
               #{requestPath}, #{httpStatus}, #{errorCode}, #{errorType}, #{errorSummary}, #{durationMs}, #{occurredAt})
            """)
    int insert(PlatformFailureEventRecord event);

    @Select("""
            <script>
            SELECT f.fingerprint, f.environment, f.service, f.tenant_id, MAX(f.tenant_name) AS tenant_name,
                   MAX(f.tenant_slug) AS tenant_slug, f.http_method, f.request_path,
                   f.http_status, f.error_code, f.error_type,
                   (SELECT latest.error_summary FROM platform_failure_event latest
                    WHERE latest.fingerprint=f.fingerprint
                      AND latest.service=f.service
                      AND latest.runtime_commit IS NOT DISTINCT FROM f.runtime_commit
                      AND ((latest.tenant_id IS NULL AND f.tenant_id IS NULL) OR latest.tenant_id=f.tenant_id)
                    ORDER BY latest.occurred_at DESC, latest.id DESC LIMIT 1) AS error_summary,
                   COUNT(*) AS occurrences,
                   (SELECT latest.duration_ms FROM platform_failure_event latest
                    WHERE latest.fingerprint=f.fingerprint
                      AND latest.service=f.service
                      AND latest.runtime_commit IS NOT DISTINCT FROM f.runtime_commit
                      AND ((latest.tenant_id IS NULL AND f.tenant_id IS NULL) OR latest.tenant_id=f.tenant_id)
                    ORDER BY latest.occurred_at DESC, latest.id DESC LIMIT 1) AS latest_duration_ms,
                   MIN(f.occurred_at) AS first_seen_at,
                   MAX(f.occurred_at) AS last_seen_at,
                   (SELECT latest.correlation_id FROM platform_failure_event latest
                    WHERE latest.fingerprint=f.fingerprint
                      AND latest.service=f.service
                      AND latest.runtime_commit IS NOT DISTINCT FROM f.runtime_commit
                      AND ((latest.tenant_id IS NULL AND f.tenant_id IS NULL) OR latest.tenant_id=f.tenant_id)
                    ORDER BY latest.occurred_at DESC, latest.id DESC LIMIT 1) AS latest_correlation_id,
                   f.runtime_commit AS runtime_commit
            FROM platform_failure_event f
            WHERE 1=1
            <if test='tenantId != null'>AND f.tenant_id=#{tenantId}</if>
            <if test='httpStatus != null'>AND f.http_status=#{httpStatus}</if>
            <if test='errorCode != null'>AND f.error_code=#{errorCode}</if>
            <if test='from != null'>AND f.occurred_at &gt;=#{from}</if>
            <if test='to != null'>AND f.occurred_at &lt;=#{to}</if>
            <if test='query != null and query != ""'>
              AND (f.correlation_id LIKE ('%' || #{query} || '%')
                OR f.tenant_name LIKE ('%' || #{query} || '%')
                OR f.tenant_slug LIKE ('%' || #{query} || '%')
                OR f.request_path LIKE ('%' || #{query} || '%')
                OR f.error_type LIKE ('%' || #{query} || '%')
                OR f.error_summary LIKE ('%' || #{query} || '%')
                OR f.runtime_commit LIKE ('%' || #{query} || '%'))
            </if>
            GROUP BY f.fingerprint, f.environment, f.service, f.tenant_id, f.http_method, f.request_path,
                     f.http_status, f.error_code, f.error_type, f.runtime_commit
            ORDER BY last_seen_at DESC, f.fingerprint DESC
            LIMIT #{size} OFFSET #{offset}
            </script>
            """)
    List<PlatformFailureEvent> search(@Param("tenantId") Long tenantId,
                                      @Param("query") String query,
                                      @Param("httpStatus") Integer httpStatus,
                                      @Param("errorCode") Integer errorCode,
                                      @Param("from") LocalDateTime from,
                                      @Param("to") LocalDateTime to,
                                      @Param("size") int size,
                                      @Param("offset") long offset);

    @Select("""
            <script>
            SELECT COUNT(*) FROM (
              SELECT f.fingerprint, f.environment, f.service, f.tenant_id, f.http_method, f.request_path,
                     f.http_status, f.error_code, f.error_type, f.runtime_commit
              FROM platform_failure_event f
              WHERE 1=1
              <if test='tenantId != null'>AND f.tenant_id=#{tenantId}</if>
              <if test='httpStatus != null'>AND f.http_status=#{httpStatus}</if>
              <if test='errorCode != null'>AND f.error_code=#{errorCode}</if>
              <if test='from != null'>AND f.occurred_at &gt;=#{from}</if>
              <if test='to != null'>AND f.occurred_at &lt;=#{to}</if>
              <if test='query != null and query != ""'>
                AND (f.correlation_id LIKE ('%' || #{query} || '%')
                  OR f.tenant_name LIKE ('%' || #{query} || '%')
                  OR f.tenant_slug LIKE ('%' || #{query} || '%')
                  OR f.request_path LIKE ('%' || #{query} || '%')
                  OR f.error_type LIKE ('%' || #{query} || '%')
                  OR f.error_summary LIKE ('%' || #{query} || '%')
                  OR f.runtime_commit LIKE ('%' || #{query} || '%'))
              </if>
              GROUP BY f.fingerprint, f.environment, f.service, f.tenant_id, f.http_method, f.request_path,
                       f.http_status, f.error_code, f.error_type, f.runtime_commit
            ) groups_found
            </script>
            """)
    long count(@Param("tenantId") Long tenantId,
               @Param("query") String query,
               @Param("httpStatus") Integer httpStatus,
               @Param("errorCode") Integer errorCode,
               @Param("from") LocalDateTime from,
               @Param("to") LocalDateTime to);
}

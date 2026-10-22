package com.orithos.tenant;

import org.apache.ibatis.annotations.*;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface PlatformAlertMapper {
    @Insert("""
        INSERT INTO platform_alert (fingerprint, environment, service, tenant_id, status, first_seen_at,
          last_seen_at, occurrence_count, latest_correlation_id, runtime_commit, updated_at)
        VALUES (#{fingerprint}, #{environment}, #{service}, #{tenantId}, 'OPEN', #{occurredAt}, #{occurredAt},
          1, #{correlationId}, #{runtimeCommit}, #{occurredAt})
        ON DUPLICATE KEY UPDATE last_seen_at=VALUES(last_seen_at), occurrence_count=occurrence_count+1,
          latest_correlation_id=VALUES(latest_correlation_id), runtime_commit=VALUES(runtime_commit), updated_at=VALUES(updated_at),
          status=IF(status='RESOLVED','OPEN',status)
        """)
    int upsert(@Param("fingerprint") String fingerprint, @Param("environment") String environment,
               @Param("service") String service, @Param("tenantId") Long tenantId,
               @Param("correlationId") String correlationId, @Param("runtimeCommit") String runtimeCommit,
               @Param("occurredAt") LocalDateTime occurredAt);

    @Select("""
        SELECT fingerprint, environment, service, tenant_id, status, assignee, acknowledgement_note,
          resolution_note, first_seen_at, last_seen_at, occurrence_count, latest_correlation_id,
          runtime_commit, acknowledged_at, resolved_at, updated_at
        FROM platform_alert WHERE (#{status} IS NULL OR status=#{status})
          AND (#{tenantId} IS NULL OR tenant_id=#{tenantId})
        ORDER BY last_seen_at DESC, id DESC LIMIT #{size} OFFSET #{offset}
        """)
    List<PlatformAlert> search(@Param("status") String status, @Param("tenantId") Long tenantId,
                               @Param("size") int size, @Param("offset") long offset);

    @Select("SELECT COUNT(*) FROM platform_alert WHERE (#{status} IS NULL OR status=#{status}) AND (#{tenantId} IS NULL OR tenant_id=#{tenantId})")
    long count(@Param("status") String status, @Param("tenantId") Long tenantId);

    @Update("""
        UPDATE platform_alert SET status=#{status}, assignee=#{assignee},
          acknowledgement_note=#{note}, resolution_note=#{resolutionNote},
          acknowledged_at=CASE WHEN #{status}='ACKNOWLEDGED' THEN COALESCE(acknowledged_at, #{now}) ELSE acknowledged_at END,
          resolved_at=CASE WHEN #{status}='RESOLVED' THEN #{now} ELSE NULL END, updated_at=#{now}
        WHERE fingerprint=#{fingerprint}
        """)
    int updateStatus(@Param("fingerprint") String fingerprint, @Param("status") String status,
                     @Param("assignee") String assignee, @Param("note") String note,
                     @Param("resolutionNote") String resolutionNote, @Param("now") LocalDateTime now);
}

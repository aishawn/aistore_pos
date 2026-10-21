package com.orithos.tenant;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface TenantProvisionAttemptMapper {

    @Insert("""
            INSERT INTO tenant_provision_attempt
              (attempt_id, tenant_id, tenant_name, tenant_slug, trigger_type, actor_id, actor_username,
               correlation_id, outcome, started_at)
            VALUES
              (#{attemptId}, #{tenantId}, #{tenantName}, #{tenantSlug}, #{triggerType}, #{actorId}, #{actorUsername},
               #{correlationId}, 'IN_PROGRESS', #{startedAt})
            """)
    int insertAttempt(TenantProvisionAttemptEntry attempt);

    @Insert("""
            INSERT INTO tenant_provision_attempt_step
              (step_id, attempt_id, step_name, outcome, started_at)
            VALUES (#{stepId}, #{attemptId}, #{stepName}, 'IN_PROGRESS', #{startedAt})
            """)
    int insertStep(@Param("stepId") String stepId,
                   @Param("attemptId") String attemptId,
                   @Param("stepName") String stepName,
                   @Param("startedAt") LocalDateTime startedAt);

    @Update("""
            UPDATE tenant_provision_attempt
            SET current_step=#{stepName}
            WHERE attempt_id=#{attemptId} AND outcome='IN_PROGRESS'
            """)
    int setCurrentStep(@Param("attemptId") String attemptId, @Param("stepName") String stepName);

    @Update("""
            UPDATE tenant_provision_attempt_step
            SET outcome=#{outcome}, resource_ref=#{resourceRef}, error_type=#{errorType},
                error_summary=#{errorSummary}, completed_at=#{completedAt}
            WHERE step_id=#{stepId} AND outcome='IN_PROGRESS'
            """)
    int finishStep(@Param("stepId") String stepId,
                   @Param("outcome") String outcome,
                   @Param("resourceRef") String resourceRef,
                   @Param("errorType") String errorType,
                   @Param("errorSummary") String errorSummary,
                   @Param("completedAt") LocalDateTime completedAt);

    @Update("""
            UPDATE tenant_provision_attempt
            SET current_step=NULL
            WHERE attempt_id=#{attemptId} AND current_step=#{stepName} AND outcome='IN_PROGRESS'
            """)
    int clearCurrentStep(@Param("attemptId") String attemptId, @Param("stepName") String stepName);

    @Update("""
            UPDATE tenant_provision_attempt
            SET outcome=#{outcome}, current_step=NULL, error_type=#{errorType},
                error_summary=#{errorSummary}, completed_at=#{completedAt}
            WHERE attempt_id=#{attemptId} AND outcome='IN_PROGRESS'
            """)
    int finishAttempt(@Param("attemptId") String attemptId,
                      @Param("outcome") String outcome,
                      @Param("errorType") String errorType,
                      @Param("errorSummary") String errorSummary,
                      @Param("completedAt") LocalDateTime completedAt);

    @Select("""
            SELECT attempt_id, tenant_id, tenant_name, tenant_slug, trigger_type, actor_id, actor_username,
                   correlation_id, outcome, current_step, error_type, error_summary, started_at, completed_at
            FROM tenant_provision_attempt
            WHERE tenant_id=#{tenantId}
            ORDER BY started_at DESC, attempt_id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<TenantProvisionAttemptEntry> pageForTenant(@Param("tenantId") long tenantId,
                                                     @Param("size") int size,
                                                     @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM tenant_provision_attempt WHERE tenant_id=#{tenantId}")
    long countForTenant(@Param("tenantId") long tenantId);

    @Select("""
            <script>
            SELECT step_id, attempt_id, step_name, outcome, resource_ref, error_type, error_summary,
                   started_at, completed_at
            FROM tenant_provision_attempt_step
            WHERE attempt_id IN
              <foreach collection='attemptIds' item='attemptId' open='(' separator=',' close=')'>#{attemptId}</foreach>
            ORDER BY started_at ASC, step_id ASC
            </script>
            """)
    List<TenantProvisionAttemptStep> stepsForAttempts(@Param("attemptIds") List<String> attemptIds);
}

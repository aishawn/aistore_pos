package com.orithos.modules.ai.report;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.alibaba.cloud.ai.graph.OverAllState;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.slf4j.LoggerFactory;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiReportAuditServiceTest {

    @Test
    void reportAuditLogDoesNotExposeQuestionOrSqlValues() {
        AiReportAuditMapper mapper = mock(AiReportAuditMapper.class);
        AiReportAuditService service = new AiReportAuditService(mapper);
        OverAllState state = mock(OverAllState.class);
        String sensitiveValue = "Secret Pinot Reserve";
        String sql = "SELECT name FROM ai_rpt_product WHERE name = '" + sensitiveValue + "'";
        when(state.value("vendor_id")).thenReturn(Optional.<Object>of(9L));
        when(state.value("user_id")).thenReturn(Optional.<Object>of(12L));
        when(state.value("outlet_id")).thenReturn(Optional.<Object>of(4L));
        when(state.value("outlet_ids")).thenReturn(Optional.<Object>of(List.of(4L)));
        when(state.value("can_report_query")).thenReturn(Optional.<Object>of(true));
        when(state.value("can_report_cost")).thenReturn(Optional.<Object>of(false));
        when(state.value("sql_error", String.class)).thenReturn(Optional.empty());
        when(state.value("sql", String.class)).thenReturn(Optional.of(sql));
        when(state.value("sql_raw", String.class)).thenReturn(Optional.empty());
        when(state.value("sql_path", String.class)).thenReturn(Optional.of("template"));
        when(state.value("report_rows")).thenReturn(
                Optional.<Object>of(List.of(Map.of("name", sensitiveValue))));
        when(state.value("report_t0")).thenReturn(Optional.empty());
        when(state.value("question", String.class)).thenReturn(Optional.of("show " + sensitiveValue));

        Logger logger = (Logger) LoggerFactory.getLogger(AiReportAuditService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.record(state);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        String messages = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .collect(Collectors.joining("\n"));
        assertFalse(messages.contains(sensitiveValue));
        assertTrue(messages.contains("AI report audit path=template allowed=true rows=1"));
    }

    @Test
    void auditStorageFailureDoesNotExposeDatabaseDiagnostic() {
        AiReportAuditMapper mapper = mock(AiReportAuditMapper.class);
        String sensitive = "secret SQL value";
        when(mapper.insert(org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyLong(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyBoolean(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyInt()))
                .thenThrow(new DataAccessResourceFailureException(sensitive));
        AiReportAuditService service = new AiReportAuditService(mapper);
        OverAllState state = mock(OverAllState.class);
        when(state.value("vendor_id")).thenReturn(Optional.<Object>of(9L));
        when(state.value("user_id")).thenReturn(Optional.<Object>of(12L));
        when(state.value("outlet_id")).thenReturn(Optional.<Object>of(4L));
        when(state.value("outlet_ids")).thenReturn(Optional.<Object>of(List.of(4L)));
        when(state.value("can_report_query")).thenReturn(Optional.<Object>of(true));
        when(state.value("can_report_cost")).thenReturn(Optional.<Object>of(false));
        when(state.value("sql_error", String.class)).thenReturn(Optional.empty());
        when(state.value("sql", String.class)).thenReturn(Optional.of("SELECT 1"));
        when(state.value("sql_raw", String.class)).thenReturn(Optional.empty());
        when(state.value("sql_path", String.class)).thenReturn(Optional.of("template"));
        when(state.value("report_rows")).thenReturn(Optional.<Object>of(List.of()));
        when(state.value("report_t0")).thenReturn(Optional.empty());
        when(state.value("question", String.class)).thenReturn(Optional.of("question"));

        Logger logger = (Logger) LoggerFactory.getLogger(AiReportAuditService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            service.record(state);
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        String messages = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .collect(Collectors.joining("\n"));
        assertFalse(messages.contains(sensitive));
        assertTrue(messages.contains("DataAccessResourceFailureException"));
    }
}

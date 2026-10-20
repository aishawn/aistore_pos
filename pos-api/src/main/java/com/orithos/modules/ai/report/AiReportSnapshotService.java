package com.orithos.modules.ai.report;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.dto.AiReportSnapshotResponse;
import com.orithos.modules.ai.dto.ReportTable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class AiReportSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(AiReportSnapshotService.class);

    private final AiReportSnapshotMapper mapper;
    private final ObjectMapper objectMapper;

    public AiReportSnapshotService(AiReportSnapshotMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public Long save(TenantContext tenant, String intent, String question, String title,
                     ReportTable table, Map<String, String> slots) {
        if (tenant == null || table == null || table.rows() == null || table.rows().isEmpty()) {
            return null;
        }
        try {
            AiReportSnapshot row = new AiReportSnapshot();
            row.setVendorId(tenant.vendorId());
            row.setUserId(tenant.userId());
            row.setOutletId(tenant.currentOutletId());
            row.setIntent(intent);
            row.setQuestion(question);
            row.setTitle(truncate(title != null && !title.isBlank() ? title : question, 512));
            List<Map<String, Object>> rows = table.rows().stream().map(ReportJsonCells::copyRow).toList();
            row.setResultJson(objectMapper.writeValueAsString(new Payload(table.columns(), rows, slots)));
            mapper.insert(row);
            return row.getId();
        } catch (JsonProcessingException | DataAccessException e) {
            log.warn("AI report snapshot save skipped type={}", e.getClass().getSimpleName());
            return null;
        } catch (Exception e) {
            log.warn("AI report snapshot save skipped type={}", e.getClass().getSimpleName());
            return null;
        }
    }

    public AiReportSnapshotResponse getOwned(long id, TenantContext tenant) {
        AiReportSnapshot row = mapper.findByIdAndOwner(id, tenant.vendorId(), tenant.userId());
        if (row == null) {
            throw new BusinessException(40401, "Report not found");
        }
        Payload payload = parse(row.getResultJson());
        List<Map<String, Object>> rows = payload.rows().stream().map(ReportJsonCells::copyRow).toList();
        return new AiReportSnapshotResponse(
                row.getId(),
                row.getIntent(),
                row.getQuestion(),
                row.getTitle(),
                new ReportTable(payload.columns(), rows),
                payload.slots() == null ? Map.of() : payload.slots(),
                row.getCreatedAt()
        );
    }

    private Payload parse(String json) {
        try {
            Payload payload = objectMapper.readValue(json, Payload.class);
            if (payload == null || payload.columns() == null || payload.rows() == null) {
                throw new BusinessException(50001, "Report data is incomplete");
            }
            return payload;
        } catch (JsonProcessingException e) {
            throw new BusinessException(50001, "Report data could not be read");
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        String trimmed = s.trim();
        if (trimmed.length() <= max) {
            return trimmed;
        }
        return trimmed.substring(0, max);
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Payload(
            List<String> columns,
            List<Map<String, Object>> rows,
            Map<String, String> slots
    ) {
        public Payload {
            columns = columns == null ? List.of() : columns;
            rows = rows == null ? List.of() : rows;
            slots = slots == null ? new LinkedHashMap<>() : slots;
        }
    }
}

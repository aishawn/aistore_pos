package com.orithos.posapi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Executor;

@Service
public class PosApiOperationService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final Executor executor;
    private final PosApiWebhookService webhooks;
    public PosApiOperationService(JdbcTemplate jdbc, ObjectMapper mapper, @Qualifier("posApiExecutor") Executor executor,PosApiWebhookService webhooks) { this.jdbc=jdbc;this.mapper=mapper;this.executor=executor;this.webhooks=webhooks; }
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void recoverInterruptedOperations() {
        String interruption=mapper.createObjectNode().put("code","service_restarted").put("message","The service restarted before this operation completed; reconcile its Odoo outcome before retrying.").toString();
        jdbc.update("UPDATE pos_api_operation SET status='unknown',error_json=?,updated_at=CURRENT_TIMESTAMP WHERE status IN ('queued','running')",interruption);
        String response=mapper.createObjectNode().put("status","unknown").put("error","service_restarted_reconcile_before_retry").toString();
        jdbc.update("UPDATE pos_api_idempotency i SET status='unknown',response_json=? FROM pos_api_operation o WHERE i.operation_id=o.id AND i.status='accepted' AND o.status='unknown' AND o.error_json LIKE '%service_restarted%'",response);
        jdbc.update("UPDATE pos_api_idempotency i SET status='unknown',response_json=? WHERE i.status='accepted' AND i.operation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pos_api_operation o WHERE o.id=i.operation_id)",response);
        jdbc.update("UPDATE pos_api_idempotency i SET status='unknown',response_json=? WHERE i.status='accepted' AND i.operation_id IS NULL",response);
    }
    public UUID create(long vendorId,long tokenId,String resource,int accepted) { UUID id=UUID.randomUUID();create(id,vendorId,tokenId,resource,accepted);return id; }
    public void create(UUID id,long vendorId,long tokenId,String resource,int accepted) {
        jdbc.update("INSERT INTO pos_api_operation(id,vendor_id,token_id,resource,status,accepted) VALUES(?,?,?,?,?,?)",id,vendorId,tokenId,resource,"queued",accepted);
    }
    public void runAsync(UUID id,Runnable task) { executor.execute(() -> { jdbc.update("UPDATE pos_api_operation SET status='running',updated_at=CURRENT_TIMESTAMP WHERE id=?",id); try { task.run(); } catch (Exception e) { fail(id,e.getMessage()); } }); }
    public void touch(UUID id) { jdbc.update("UPDATE pos_api_operation SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'",id); }
    public void progress(UUID id,int created,int updated,int skipped,int errors) {
        jdbc.update("UPDATE pos_api_operation SET created_count=?,updated_count=?,skipped_count=?,error_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running'",created,updated,skipped,errors,id);
    }
    public void removeUnclaimed(UUID id) { jdbc.update("DELETE FROM pos_api_operation WHERE id=? AND status='queued'",id); }
    public void complete(UUID id, JsonNode result) { jdbc.update("UPDATE pos_api_operation SET status='completed',result_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",result.toString(),id); }
    public void complete(UUID id, JsonNode result,int created,int updated,int skipped,int errors) {
        var errorDetails=mapper.createArrayNode();
        if(result.path("records").isArray())result.path("records").forEach(item->{if("failed".equals(item.path("status").asText()))errorDetails.add(item);});
        jdbc.update("UPDATE pos_api_operation SET status=?,result_json=?,created_count=?,updated_count=?,skipped_count=?,error_count=?,error_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",errors>0?"completed_with_errors":"completed",result.toString(),created,updated,skipped,errors,errorDetails.toString(),id);
        webhooks.publish(jdbc.queryForObject("SELECT vendor_id FROM pos_api_operation WHERE id=?",Long.class,id),"operation.completed",Map.of("operationId",id.toString(),"created",created,"updated",updated,"skipped",skipped,"errors",errors));
    }
    public void fail(UUID id,String message) { jdbc.update("UPDATE pos_api_operation SET status='failed',error_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",mapper.createObjectNode().put("message",message==null?"operation failed":message).toString(),id);webhooks.publish(jdbc.queryForObject("SELECT vendor_id FROM pos_api_operation WHERE id=?",Long.class,id),"operation.failed",Map.of("operationId",id.toString(),"message",message==null?"operation failed":message)); }
    public Map<String,Object> get(UUID id,long vendorId) {
        return jdbc.query("SELECT id,resource,status,accepted,created_count,updated_count,skipped_count,error_count,result_json,error_json,created_at,updated_at FROM pos_api_operation WHERE id=? AND vendor_id=?",rs->{
            if(!rs.next()) return Map.of("operationId",id.toString(),"status","not_found");
            try {
                var response=new java.util.LinkedHashMap<String,Object>();response.put("operationId",rs.getString("id"));response.put("resource",rs.getString("resource"));response.put("status",rs.getString("status"));response.put("accepted",rs.getInt("accepted"));response.put("created",rs.getInt("created_count"));response.put("updated",rs.getInt("updated_count"));response.put("skipped",rs.getInt("skipped_count"));response.put("errorCount",rs.getInt("error_count"));response.put("createdAt",rs.getTimestamp("created_at").toLocalDateTime());response.put("updatedAt",rs.getTimestamp("updated_at").toLocalDateTime());
                String result=rs.getString("result_json");if(result!=null)response.put("result",mapper.readTree(result));String errors=rs.getString("error_json");if(errors!=null)response.put("details",mapper.readTree(errors));return response;
            } catch(Exception e) { return Map.of("operationId",id,"status","error"); }
        },id,vendorId);
    }
}

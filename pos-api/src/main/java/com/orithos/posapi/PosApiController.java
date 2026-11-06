package com.orithos.posapi;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.tenant.TenantHolder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;

@RestController
@RequestMapping("/api/pos/v1")
public class PosApiController {
    private static final Map<String, Resource> RESOURCES = Map.of(
            "products", new Resource("product.template", List.of("id","name","default_code","barcode","list_price","standard_price","categ_id","active","write_date")),
            "customers", new Resource("res.partner", List.of("id","name","email","phone","active","write_date")),
            "suppliers", new Resource("res.partner", List.of("id","name","email","phone","active","write_date")),
            "sales", new Resource("pos.order", List.of("id","name","date_order","amount_total","state","partner_id","write_date")),
            "orders", new Resource("sale.order", List.of("id","name","date_order","amount_total","state","partner_id","write_date")),
            "purchases", new Resource("purchase.order", List.of("id","name","date_order","amount_total","state","partner_id","write_date"))
    );
    private final PosApiTokenService tokens;
    private final VendorMapper vendors;
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String odooUrl, database, username, password;
    private final AtomicLong rpcId = new AtomicLong();
    public PosApiController(PosApiTokenService tokens, VendorMapper vendors, JdbcTemplate jdbc, ObjectMapper mapper,
            @Value("${ODOO_BASE_URL:}") String odooUrl, @Value("${ODOO_DATABASE:aipos_uat}") String database,
            @Value("${ODOO_SERVICE_USERNAME:}") String username, @Value("${ODOO_SERVICE_PASSWORD:}") String password) {
        this.tokens=tokens;this.vendors=vendors;this.jdbc=jdbc;this.mapper=mapper;this.odooUrl=odooUrl.replaceAll("/+$", "");this.database=database;this.username=username;this.password=password;
    }
    @PostMapping("/auth/tokens") @PreAuthorize("isAuthenticated()")
    public Object createToken(@RequestBody TokenRequest request) {
        AuthUser user=CurrentUser.get(); if(user==null || !user.admin() || user.vendorId()==null) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"vendor administrator required");
        Set<String> scopes=request.scopes()==null?Set.of("api.read"):Set.copyOf(request.scopes());
        Set<String> allowed=Set.of("api.read","api.write","api.batch","api.webhook","api.admin");
        if(scopes.isEmpty()||!allowed.containsAll(scopes)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"invalid scopes");
        return tokens.create(user.vendorId(),user.id(),request.name()==null?"cli":request.name(),scopes,request.expiresAt());
    }
    @DeleteMapping("/auth/tokens/{id}") @PreAuthorize("isAuthenticated()")
    public Object revokeToken(@PathVariable long id) { AuthUser u=CurrentUser.get(); if(u==null||!u.admin()||u.vendorId()==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN);tokens.revoke(u.vendorId(),id);return Map.of("revoked",true); }
    @GetMapping("/{resource}")
    public Object list(@PathVariable String resource,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="100") int limit,Authentication auth) throws Exception {
        require(auth,"api.read"); Resource spec=resource(resource); if(offset<0||limit<1||limit>500)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"invalid pagination");
        long company=company(auth); ArrayNode domain=resourceDomain(resource,company);
        ObjectNode kwargs=mapper.createObjectNode();ArrayNode fields=mapper.createArrayNode();spec.fields.forEach(fields::add);kwargs.set("fields",fields);kwargs.put("limit",limit);kwargs.put("offset",offset);kwargs.set("order",mapper.getNodeFactory().textNode("id asc"));
        JsonNode rows=callKw(auth,spec.model,"search_read",List.of(domain),kwargs,company);
        return Map.of("requestId",UUID.randomUUID().toString(),"resource",resource,"offset",offset,"limit",limit,"items",rows);
    }
    @GetMapping("/{resource}/{id}")
    public Object get(@PathVariable String resource,@PathVariable long id,Authentication auth) throws Exception {
        require(auth,"api.read");Resource spec=resource(resource);long company=company(auth);ArrayNode domain=resourceDomain(resource,company);domain.add(mapper.createArrayNode().add("id").add("=").add(id));
        ObjectNode kwargs=mapper.createObjectNode();ArrayNode fields=mapper.createArrayNode();spec.fields.forEach(fields::add);kwargs.set("fields",fields);kwargs.put("limit",1);
        JsonNode rows=callKw(auth,spec.model,"search_read",List.of(domain),kwargs,company);if(!rows.isArray()||rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"resource not found");return rows.get(0);
    }
    @PostMapping("/{resource}:batch")
    public Object batch(@PathVariable String resource,@RequestHeader(value="Idempotency-Key",required=false) String key,@RequestBody JsonNode body,Authentication auth) {
        require(auth,"api.batch");resource(resource); if(key==null||key.isBlank())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Idempotency-Key required");
        String requestHash=sha256(body.toString());PosApiToken token=(PosApiToken)auth.getPrincipal();
        var prior=jdbc.query("SELECT request_hash,response_json FROM pos_api_idempotency WHERE vendor_id=? AND token_id=? AND idempotency_key=? AND expires_at>CURRENT_TIMESTAMP",rs->rs.next()?new String[]{rs.getString(1),rs.getString(2)}:null,token.vendorId(),token.id(),key);
        if(prior!=null){if(!requestHash.equals(prior[0]))throw new ResponseStatusException(HttpStatus.CONFLICT,"idempotency_key_reused");try{return mapper.readTree(prior[1]);}catch(Exception e){throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR);}}
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,"batch writes are disabled until resource-specific Odoo write policies pass UAT isolation gates");
    }
    @GetMapping("/operations/{id}") public Object operation(@PathVariable String id,Authentication auth){require(auth,"api.read");return Map.of("operationId",id,"status","not_found");}
    private Resource resource(String name){Resource r=RESOURCES.get(name);if(r==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"unsupported resource");return r;}
    private ArrayNode resourceDomain(String name,long company){
        ArrayNode domain=mapper.createArrayNode();
        if(Set.of("products","customers","suppliers").contains(name)){
            domain.add("|");domain.add(mapper.createArrayNode().add("company_id").add("=").add(false));domain.add(mapper.createArrayNode().add("company_id").add("=").add(company));
        }else domain.add(mapper.createArrayNode().add("company_id").add("=").add(company));
        if("suppliers".equals(name))domain.add(mapper.createArrayNode().add("supplier_rank").add(">").add(0));
        if("customers".equals(name))domain.add(mapper.createArrayNode().add("customer_rank").add(">").add(0));
        return domain;
    }
    private void require(Authentication auth,String scope){if(auth==null||!auth.isAuthenticated()||!(auth.getPrincipal() instanceof PosApiToken t)||!t.usable())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"invalid_api_token");if(!t.allows(scope))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"insufficient_scope");}
    private long company(Authentication auth){PosApiToken t=(PosApiToken)auth.getPrincipal();var v=vendors.findById(t.vendorId());if(v==null||v.getOdooCompanyId()==null||v.getOdooCompanyId()<=0||!"ready".equals(v.getOdooProvisionStatus()))throw new ResponseStatusException(HttpStatus.CONFLICT,"odoo_company_not_ready");return v.getOdooCompanyId();}
    private JsonNode callKw(Authentication auth,String model,String method,List<?> args,ObjectNode kwargs,long company)throws Exception {
        if(odooUrl.isBlank()||database.isBlank()||username.isBlank()||password.isBlank())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"odoo_service_unavailable");
        String cookie=authenticate();ObjectNode context=kwargs.putObject("context");context.set("allowed_company_ids",mapper.createArrayNode().add(company));
        ObjectNode payload=mapper.createObjectNode();payload.put("jsonrpc","2.0");payload.put("id",rpcId.incrementAndGet());ObjectNode params=payload.putObject("params");params.put("model",model);params.put("method",method);params.set("args",mapper.valueToTree(args));params.set("kwargs",kwargs);
        var request=HttpRequest.newBuilder(URI.create(odooUrl+"/web/dataset/call_kw/"+model+"/"+method)).timeout(Duration.ofSeconds(30)).header("Content-Type","application/json").header("Cookie",cookie).POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload))).build();
        var response=http.send(request,HttpResponse.BodyHandlers.ofString());JsonNode root=mapper.readTree(response.body());if(response.statusCode()/100!=2||root.has("error"))throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"odoo_read_failed");return root.path("result");
    }
    private String authenticate()throws Exception {ObjectNode p=mapper.createObjectNode();p.put("jsonrpc","2.0");p.put("id",rpcId.incrementAndGet());ObjectNode params=p.putObject("params");params.put("db",database);params.put("login",username);params.put("password",password);var req=HttpRequest.newBuilder(URI.create(odooUrl+"/web/session/authenticate")).timeout(Duration.ofSeconds(20)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(p))).build();var res=http.send(req,HttpResponse.BodyHandlers.ofString());if(mapper.readTree(res.body()).path("result").path("uid").isMissingNode())throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"odoo_auth_failed");return res.headers().allValues("set-cookie").stream().map(s->s.split(";",2)[0]).filter(s->s.startsWith("session_id=")).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_GATEWAY,"odoo_session_missing"));}
    private String sha256(String text){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    public record TokenRequest(String name,Set<String> scopes,LocalDateTime expiresAt){}
    private record Resource(String model,List<String> fields){}
}

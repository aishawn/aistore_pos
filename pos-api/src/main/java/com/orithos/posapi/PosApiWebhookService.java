package com.orithos.posapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.Mac;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.*;

@Service
public class PosApiWebhookService {
    private final JdbcTemplate jdbc; private final ObjectMapper mapper; private final byte[] key; private final HttpClient http=HttpClient.newHttpClient(); private final SecureRandom random=new SecureRandom();
    public PosApiWebhookService(JdbcTemplate jdbc,ObjectMapper mapper,@Value("${POS_API_WEBHOOK_ENCRYPTION_KEY:${TOKEN_ENCRYPTION_KEY:}}") String encryptionKey){this.jdbc=jdbc;this.mapper=mapper;this.key=key(encryptionKey);}
    public Registration create(long vendor,long token,String endpoint,Set<String> events){if(key==null)throw new IllegalStateException("webhook_encryption_key_missing");validateEndpoint(endpoint);String secret="whsec_"+randomHex(32);String cipher=encrypt(secret);String hash=sha256(secret);Number id=jdbc.queryForObject("INSERT INTO pos_api_webhook(vendor_id,token_id,endpoint_url,secret_hash,secret_ciphertext,events) VALUES(?,?,?,?,?,?) RETURNING id",Number.class,vendor,token,endpoint,hash,cipher,String.join(",",events));return new Registration(id.longValue(),secret,events);}
    public void revoke(long vendor,long id){jdbc.update("UPDATE pos_api_webhook SET active=false WHERE id=? AND vendor_id=?",id,vendor);}
    public void publish(long vendor,String event,Object payload){try{var rows=jdbc.query("SELECT id,events FROM pos_api_webhook WHERE vendor_id=? AND active=true",(rs,n)->Map.entry(rs.getLong("id"),rs.getString("events")),vendor);UUID eventId=UUID.randomUUID();String json=mapper.createObjectNode().put("id",eventId.toString()).put("type",event).set("data",mapper.valueToTree(payload)).toString();for(var row:rows){if(!matchesEvent(row.getValue(),event))continue;jdbc.update("INSERT INTO pos_api_webhook_delivery(webhook_id,event_id,event_type,payload_json) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",row.getKey(),eventId,event,json);}}catch(Exception ignored){}}
    static boolean matchesEvent(String configuredEvents,String event){if(configuredEvents==null||event==null||event.isBlank())return false;String expected=event.trim();for(String configured:configuredEvents.split(",",-1)){String candidate=configured.trim();if("*".equals(candidate)||candidate.equals(expected))return true;}return false;}
    private void deliver(long id,String endpoint,String secret,UUID eventId,String body){try{validateEndpoint(endpoint);var req=HttpRequest.newBuilder(URI.create(endpoint)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json").header("X-Orithos-Event",eventId.toString()).header("X-Orithos-Signature",signatureHeader(secret,body)).POST(HttpRequest.BodyPublishers.ofString(body)).build();var res=http.send(req,HttpResponse.BodyHandlers.discarding());if(res.statusCode()/100==2)jdbc.update("UPDATE pos_api_webhook_delivery SET status='delivered',attempts=attempts+1,claimed_until=NULL,delivered_at=CURRENT_TIMESTAMP WHERE webhook_id=? AND event_id=?",id,eventId);else retry(id,eventId);}catch(Exception e){retry(id,eventId);}}
    private void retry(long id,UUID eventId){jdbc.update("UPDATE pos_api_webhook_delivery SET status=CASE WHEN attempts+1>=8 THEN 'failed' ELSE 'retry' END,attempts=attempts+1,claimed_until=NULL,next_attempt_at=CURRENT_TIMESTAMP + INTERVAL '5 minutes' WHERE webhook_id=? AND event_id=?",id,eventId);}
    private String encrypt(String value){try{byte[] iv=new byte[12];random.nextBytes(iv);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,iv));byte[] encrypted=c.doFinal(value.getBytes(StandardCharsets.UTF_8));return Base64.getEncoder().encodeToString(iv)+"."+Base64.getEncoder().encodeToString(encrypted);}catch(Exception e){throw new IllegalStateException("webhook_secret_encryption_failed");}}
    private String decrypt(String value)throws Exception{String[] p=value.split("\\.",2);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,new SecretKeySpec(key,"AES"),new GCMParameterSpec(128,Base64.getDecoder().decode(p[0])));return new String(c.doFinal(Base64.getDecoder().decode(p[1])),StandardCharsets.UTF_8);}
    @Scheduled(fixedDelay=30000) public void retry(){if(key==null)return;var rows=jdbc.query("WITH due AS (SELECT d.id FROM pos_api_webhook_delivery d JOIN pos_api_webhook w ON w.id=d.webhook_id WHERE d.status IN ('pending','retry') AND d.attempts<8 AND d.next_attempt_at<=CURRENT_TIMESTAMP AND (d.claimed_until IS NULL OR d.claimed_until<CURRENT_TIMESTAMP) AND w.active=true ORDER BY d.next_attempt_at LIMIT 50 FOR UPDATE OF d SKIP LOCKED) UPDATE pos_api_webhook_delivery d SET claimed_until=CURRENT_TIMESTAMP + INTERVAL '2 minutes' FROM due WHERE d.id=due.id RETURNING d.id,d.webhook_id,d.event_id,d.payload_json",(rs,n)->new Object[]{rs.getLong(1),rs.getLong(2),rs.getObject(3,UUID.class),rs.getString(4)});for(Object[] row:rows){try{var sub=jdbc.queryForObject("SELECT endpoint_url,secret_ciphertext FROM pos_api_webhook WHERE id=? AND active=true",(rs,n)->new String[]{rs.getString(1),rs.getString(2)},row[1]);deliver((long)row[1],sub[0],decrypt(sub[1]),(UUID)row[2],(String)row[3]);}catch(Exception e){retry((long)row[1],(UUID)row[2]);}}}
    private void validateEndpoint(String value){validateEndpoint(value,host->java.net.InetAddress.getAllByName(host));}
    static void validateEndpoint(String value,HostResolver resolver){try{URI uri=URI.create(value);if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getPort()!=-1&&uri.getPort()!=443)throw new IllegalArgumentException("webhook_endpoint_invalid");java.net.InetAddress[] addresses=resolver.resolve(uri.getHost());if(addresses==null||addresses.length==0)throw new IllegalArgumentException("webhook_endpoint_invalid");for(var address:addresses)if(address.isAnyLocalAddress()||address.isLoopbackAddress()||address.isLinkLocalAddress()||address.isSiteLocalAddress()||address.isMulticastAddress())throw new IllegalArgumentException("webhook_endpoint_not_public");}catch(IllegalArgumentException e){throw e;}catch(Exception e){throw new IllegalArgumentException("webhook_endpoint_invalid");}}
    private static byte[] key(String raw){if(raw==null||raw.isBlank())return null;try{return MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));}catch(Exception e){return null;}}
    private String randomHex(int bytes){byte[] b=new byte[bytes];random.nextBytes(b);return HexFormat.of().formatHex(b);}
    private String sha256(String s){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
    static String signatureHeader(String secret,String body){try{Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8),"HmacSHA256"));return "sha256="+Base64.getEncoder().encodeToString(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException("webhook_signature_failed");}}
    @FunctionalInterface interface HostResolver {java.net.InetAddress[] resolve(String host) throws Exception;}
    public record Registration(long id,String secret,Set<String> events){}
}

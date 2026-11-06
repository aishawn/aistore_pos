package com.orithos.posapi;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class PosApiTokenService {
    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    public PosApiTokenService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public Created create(long vendorId, Long actorId, String name, Set<String> scopes, LocalDateTime expiresAt) {
        String prefix = randomHex(8);
        String raw = "op_" + prefix + "_" + randomHex(32);
        String hash = encoder.encode(raw);
        Number id = jdbc.queryForObject("INSERT INTO pos_api_token(vendor_id,created_by,token_hash,token_prefix,name,scopes,expires_at) VALUES(?,?,?,?,?,?,?) RETURNING id",
                Number.class, vendorId, actorId, hash, prefix, name, String.join(" ", scopes), expiresAt);
        return new Created(id.longValue(), raw, expiresAt, scopes);
    }
    public Optional<PosApiToken> authenticate(String raw) {
        if (raw == null || raw.isBlank()) return Optional.empty();
        raw=raw.trim();
        if(!raw.startsWith("op_")||raw.indexOf('_',3)<0)return Optional.empty();
        String prefix=raw.substring(3,raw.indexOf('_',3));
        if(prefix.length()!=16||!prefix.chars().allMatch(ch->Character.digit(ch,16)>=0))return Optional.empty();
        return jdbc.query("SELECT id,vendor_id,name,scopes,expires_at,revoked_at,token_hash FROM pos_api_token WHERE token_prefix=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)", rs -> {
            if (!rs.next() || !encoder.matches(raw, rs.getString("token_hash"))) return Optional.empty();
            jdbc.update("UPDATE pos_api_token SET last_used_at=CURRENT_TIMESTAMP WHERE id=?", rs.getLong("id"));
            return Optional.of(new PosApiToken(rs.getLong("id"), rs.getLong("vendor_id"), rs.getString("name"),
                    Set.of(rs.getString("scopes").split(" ")), rs.getTimestamp("expires_at") == null ? null : rs.getTimestamp("expires_at").toLocalDateTime(), null));
        },prefix);
    }
    public void revoke(long vendorId, long id) { jdbc.update("UPDATE pos_api_token SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND vendor_id=?", id, vendorId); }
    private String randomHex(int bytes) { byte[] b = new byte[bytes]; random.nextBytes(b); StringBuilder s=new StringBuilder(); for(byte x:b)s.append(String.format("%02x",x)); return s.toString(); }
    public record Created(long id, String token, LocalDateTime expiresAt, Set<String> scopes) {}
}

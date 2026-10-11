package com.orithos.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Issues and validates HS256 JWTs. */
@Service
public class JwtService {

    private final JwtProperties props;
    private final SecretKey key;

    public JwtService(JwtProperties props) {
        this.props = props;
        this.key = Keys.hmacShaKeyFor(props.getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public record IssuedToken(String token, String jti, Date expiry) {}

    public IssuedToken issueAccess(Long userId, String username, boolean admin, Long outletId,
                                   List<String> authorities) {
        return issue(userId, username, "access", admin, outletId, authorities,
                props.getAccessTokenTtlMinutes() * 60_000L);
    }

    public IssuedToken issueRefresh(Long userId, String username) {
        return issue(userId, username, "refresh", false, null, List.of(),
                props.getRefreshTokenTtlDays() * 24 * 60 * 60_000L);
    }

    private IssuedToken issue(Long userId, String username, String type, boolean admin, Long outletId,
                              List<String> authorities, long ttlMillis) {
        String jti = UUID.randomUUID().toString();
        Date now = new Date();
        Date exp = new Date(now.getTime() + ttlMillis);
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("username", username);
        claims.put("type", type);
        claims.put("admin", admin);
        claims.put("authorities", authorities);
        if (outletId != null) {
            claims.put("outletId", outletId);
        }
        String token = Jwts.builder()
                .issuer(props.getIssuer())
                .subject(String.valueOf(userId))
                .id(jti)
                .issuedAt(now)
                .expiration(exp)
                .claims(claims)
                .signWith(key)
                .compact();
        return new IssuedToken(token, jti, exp);
    }

    /** JWT numeric claims may arrive as Integer, Long, or String. */
    public static Long claimAsLong(Claims claims, String name) {
        Object raw = claims.get(name);
        if (raw instanceof Number n) {
            return n.longValue();
        }
        if (raw instanceof String s && !s.isBlank()) {
            return Long.parseLong(s);
        }
        return null;
    }

    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }
}

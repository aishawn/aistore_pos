package com.orithos.modules.ai.sommelier;

import com.orithos.modules.ai.report.TenantContext;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class WineTenantContextTokenTest {
    private static final String SECRET = "wine-knowledge-shared-hmac-secret-40";

    @Test
    void signsAuthenticatedTenantAndShortLivedScopes() {
        Instant now = Instant.parse("2026-11-27T00:00:00Z");
        TenantContext tenant = new TenantContext(31, 17, 9L, List.of(9L), Set.of("perm:stock.products.edit"));

        String token = WineTenantContextToken.sign(tenant, Set.of("wine:recommend", "wine:curate"), SECRET, now);
        var claims = Jwts.parser().verifyWith(Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8)))
                .clock(() -> Date.from(now)).build().parseSignedClaims(token).getPayload();

        assertEquals("orithos-pos", claims.getIssuer());
        assertEquals("orithos-ai", claims.getAudience().iterator().next());
        assertEquals("17", claims.getSubject());
        assertEquals(31, claims.get("vendor_id", Integer.class));
        assertEquals(9, claims.get("outlet_id", Integer.class));
        assertEquals(Set.of("wine:recommend", "wine:curate"), Set.copyOf(claims.get("scope", List.class)));
        assertEquals(now.plusSeconds(60).getEpochSecond(), claims.getExpiration().toInstant().getEpochSecond());
    }

    @Test
    void rejectsMissingOutletOrWeakSigningSecret() {
        TenantContext noOutlet = new TenantContext(31, 17, null, List.of(), Set.of());
        assertThrows(IllegalArgumentException.class,
                () -> WineTenantContextToken.sign(noOutlet, Set.of("wine:recommend"), SECRET));
        assertThrows(IllegalArgumentException.class,
                () -> WineTenantContextToken.sign(new TenantContext(31, 17, 9L, List.of(9L), Set.of()),
                        Set.of("wine:recommend"), "short"));
    }
}

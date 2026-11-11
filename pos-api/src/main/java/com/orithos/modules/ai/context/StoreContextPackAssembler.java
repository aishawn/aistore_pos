package com.orithos.modules.ai.context;

import com.orithos.modules.ai.AiConversationMemory;
import com.orithos.modules.ai.report.CategoryLexicon;
import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Locale;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * Builds a small per-ask store context pack for the assistant graph.
 */
@Component
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class StoreContextPackAssembler {

    private static final long META_CACHE_MILLIS = 10 * 60 * 1000L;
    /** Store business-day default when tenant timezone is unavailable. */
    private static final ZoneId DEFAULT_BUSINESS_ZONE = ZoneId.of("Australia/Adelaide");

    private final VendorMapper vendorMapper;
    private final NativeAiReportQueryService reportQueryService;
    private final AiConversationMemory conversationMemory;
    private final ConcurrentMap<Long, CachedMeta> metaCache = new ConcurrentHashMap<>();

    public StoreContextPackAssembler(
            VendorMapper vendorMapper,
            NativeAiReportQueryService reportQueryService,
            AiConversationMemory conversationMemory) {
        this.vendorMapper = vendorMapper;
        this.reportQueryService = reportQueryService;
        this.conversationMemory = conversationMemory;
    }

    public StoreContextPack assemble(TenantContext tenant, String threadId, String surface) {
        if (tenant == null) {
            return emptyPack(surface);
        }
        CachedMeta meta = null;
        try {
            meta = vendorMeta(tenant.vendorId());
        } catch (RuntimeException ignored) {
            // A vendor lookup outage must not make the assistant unavailable.
        }
        ZoneId zone = DEFAULT_BUSINESS_ZONE;
        try {
            ZoneId resolved = reportQueryService.businessTimezone(tenant);
            if (resolved != null) {
                zone = resolved;
            }
        } catch (RuntimeException ignored) {
            // Keep the store-safe default when the native service is unavailable.
        }
        AiConversationMemory.LastSlots last = conversationMemory.loadLastSlots(threadId);
        return new StoreContextPack(
                tenant.vendorId(),
                tenant.currentOutletId(),
                meta == null ? "" : meta.name(),
                meta == null ? "" : meta.subdomain(),
                zone == null ? DEFAULT_BUSINESS_ZONE.getId() : zone.getId(),
                tenant.canQueryReport(),
                tenant.canQueryCost(),
                last == null ? "" : last.intent(),
                last == null ? Map.of() : last.slots(),
                lexiconHints(),
                normalizeSurface(surface)
        );
    }

    private CachedMeta vendorMeta(long vendorId) {
        CachedMeta cached = metaCache.get(vendorId);
        if (cached != null && cached.expiresAtMillis() > System.currentTimeMillis()) {
            return cached;
        }
        Vendor vendor = vendorMapper.findById(vendorId);
        if (vendor == null) {
            return null;
        }
        CachedMeta next = new CachedMeta(
                vendor.getName() == null ? "" : vendor.getName(),
                vendor.getSubdomain() == null ? "" : vendor.getSubdomain(),
                System.currentTimeMillis() + META_CACHE_MILLIS
        );
        metaCache.put(vendorId, next);
        return next;
    }

    private static List<String> lexiconHints() {
        // Bounded alias samples — not a full catalogue dump.
        List<String> hints = new ArrayList<>();
        for (String sample : List.of("啤酒", "beer", "红酒", "wine", "威士忌", "whisky")) {
            List<String> terms = CategoryLexicon.searchTerms(sample);
            if (!terms.isEmpty()) {
                hints.add(sample + "→" + String.join("/", terms.stream().limit(3).toList()));
            }
        }
        return hints.size() > 8 ? hints.subList(0, 8) : hints;
    }

    private static String normalizeSurface(String surface) {
        return surface == null ? "" : surface.trim().toLowerCase(Locale.ROOT);
    }

    private static StoreContextPack emptyPack(String surface) {
        return new StoreContextPack(
                0L, null, "", "", DEFAULT_BUSINESS_ZONE.getId(),
                false, false, "", Map.of(), List.of(), normalizeSurface(surface));
    }

    private record CachedMeta(String name, String subdomain, long expiresAtMillis) {}
}

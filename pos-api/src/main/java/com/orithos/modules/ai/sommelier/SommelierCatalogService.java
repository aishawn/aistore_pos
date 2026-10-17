package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper.CatalogRow;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class SommelierCatalogService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final SommelierProductMapper mapper;
    private final ObjectMapper objectMapper;
    private final OdooWineCatalogClient odooWineCatalogClient;

    public SommelierCatalogService(
            SommelierProductMapper mapper,
            ObjectMapper objectMapper,
            OdooWineCatalogClient odooWineCatalogClient) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.odooWineCatalogClient = odooWineCatalogClient;
    }

    public List<WineCandidate> listWines(Long outletId) {
        // Once Odoo is configured it is the business source of truth. An empty
        // result (including a temporary Odoo failure) must not expose stale
        // legacy MySQL products as if they were current store inventory.
        if (odooWineCatalogClient.isConfigured()) return odooCatalog();
        return toCandidates(mapper.listCatalog(outletId), true);
    }

    public List<WineCandidate> search(Long outletId, String q) {
        if (q == null || q.isBlank()) return List.of();
        if (odooWineCatalogClient.isConfigured()) {
            List<WineCandidate> odoo = odooCatalog();
            String needle = q.trim().toLowerCase();
            return odoo.stream()
                    .filter(w -> w.name() != null && w.name().toLowerCase().contains(needle))
                    .toList();
        }
        return toCandidates(mapper.searchCatalog(outletId, q.trim()), false);
    }

    public WineCandidate findById(Long id, Long outletId) {
        if (id == null) return null;
        if (odooWineCatalogClient.isConfigured()) {
            List<WineCandidate> odoo = odooCatalog();
            return odoo.stream().filter(w -> id.equals(w.productId())).findFirst().orElse(null);
        }
        List<WineCandidate> found = toCandidates(listOf(mapper.findById(id, outletId)), false);
        return found.isEmpty() ? null : found.get(0);
    }

    private List<WineCandidate> odooCatalog() {
        if (!odooWineCatalogClient.isConfigured()) return List.of();
        return deduplicateDisplayProducts(odooWineCatalogClient.listWines());
    }

    /**
     * Odoo can contain repeated demo/product rows after repeated tenant seeds.
     * The sommelier is a customer-facing catalogue, so show one stable card per
     * name and price while keeping the real product id of the best stocked row.
     */
    private List<WineCandidate> deduplicateDisplayProducts(List<WineCandidate> candidates) {
        if (candidates == null || candidates.isEmpty()) return List.of();
        Map<String, WineCandidate> unique = new LinkedHashMap<>();
        for (WineCandidate candidate : candidates) {
            if (candidate == null || candidate.name() == null || candidate.name().isBlank()) continue;
            String key = candidate.name().trim().toLowerCase(Locale.ROOT)
                    + "|" + candidate.effectivePrice().stripTrailingZeros().toPlainString();
            WineCandidate existing = unique.get(key);
            if (existing == null || isBetterDisplayRow(candidate, existing)) {
                unique.put(key, candidate);
            }
        }
        return List.copyOf(unique.values());
    }

    private boolean isBetterDisplayRow(WineCandidate candidate, WineCandidate existing) {
        if (candidate.inStock() != existing.inStock()) return candidate.inStock();
        BigDecimal candidateStock = candidate.stockQuantity() == null ? BigDecimal.ZERO : candidate.stockQuantity();
        BigDecimal existingStock = existing.stockQuantity() == null ? BigDecimal.ZERO : existing.stockQuantity();
        int stock = candidateStock.compareTo(existingStock);
        if (stock != 0) return stock > 0;
        Long candidateId = candidate.productId();
        Long existingId = existing.productId();
        return candidateId != null && (existingId == null || candidateId < existingId);
    }

    private List<WineCandidate> toCandidates(List<CatalogRow> rows, boolean wineOnly) {
        if (rows == null || rows.isEmpty()) return List.of();
        List<WineCandidate> out = new ArrayList<>(rows.size());
        for (CatalogRow row : rows) {
            if (row == null || row.getId() == null) continue;
            boolean looksWine = WineLexicon.looksLikeWine(row.getName(), row.getCategoryName(), row.getFamilyName())
                    || row.getStoredWineType() != null;
            if (wineOnly && !looksWine) continue;
            out.add(toCandidate(row, looksWine));
        }
        return out;
    }

    private WineCandidate toCandidate(CatalogRow row, boolean looksWine) {
        WineProfile profile = storedProfile(row);
        if (profile == null) {
            profile = looksWine
                    ? WineLexicon.infer(row.getName(), row.getCategoryName(), row.getFamilyName(), row.getDescription())
                    : WineProfile.empty(WineLexicon.inferType(
                            WineLexicon.normalize(nullToEmpty(row.getName()) + " " + nullToEmpty(row.getCategoryName()))));
        }
        BigDecimal list = nz(row.getPrice());
        BigDecimal promo = row.getPromoPrice();
        boolean onPromo = promo != null && promo.compareTo(BigDecimal.ZERO) > 0 && promo.compareTo(list) < 0;
        BigDecimal sell = onPromo ? promo : list;
        boolean track = row.getTrackInventory() == null || row.getTrackInventory();
        return new WineCandidate(
                row.getId(),
                row.getName(),
                row.getDescription(),
                row.getImage(),
                row.getCategoryName(),
                row.getFamilyName(),
                row.getBrandName(),
                list,
                sell,
                onPromo,
                nz(row.getStockQuantity()),
                track,
                row.getCaseQuantity() == null ? BigDecimal.ONE : row.getCaseQuantity(),
                profile
        );
    }

    private WineProfile storedProfile(CatalogRow row) {
        if (row.getStoredWineType() == null || row.getStoredWineType().isBlank()) return null;
        return new WineProfile(
                row.getStoredWineType().toLowerCase(),
                row.getStoredVarietal(),
                row.getStoredRegion(),
                row.getStoredVintage(),
                row.getStoredDryness(),
                row.getStoredBody(),
                row.getStoredFruitiness(),
                row.getStoredOak(),
                row.getStoredTannin(),
                parseTags(row.getStoredAromaTags()),
                parseTags(row.getStoredPalateTags()),
                parseTags(row.getStoredFoodTags()),
                row.getStoredFinishNote(),
                false
        );
    }

    private List<String> parseTags(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            List<String> parsed = objectMapper.readValue(raw, STRING_LIST);
            return parsed == null ? List.of() : parsed;
        } catch (Exception ignored) {
            String[] parts = raw.split("[,;]");
            List<String> out = new ArrayList<>();
            for (String p : parts) {
                String t = p.trim();
                if (!t.isEmpty()) out.add(t);
            }
            return out;
        }
    }

    private static List<CatalogRow> listOf(CatalogRow row) {
        return row == null ? List.of() : List.of(row);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }
}

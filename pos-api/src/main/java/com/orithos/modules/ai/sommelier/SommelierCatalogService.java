package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper.CatalogRow;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Service
public class SommelierCatalogService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final SommelierProductMapper mapper;
    private final ObjectMapper objectMapper;

    public SommelierCatalogService(
            SommelierProductMapper mapper,
            ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public List<WineCandidate> listWines(Long outletId) {
        return toCandidates(mapper.listCatalog(outletId), true);
    }

    public List<WineCandidate> listWines(TenantContext tenant) {
        Long outletId = tenant == null ? null : tenant.requireOutletId();
        return toCandidates(mapper.listCatalog(outletId), true);
    }

    public List<WineCandidate> search(Long outletId, String q) {
        if (q == null || q.isBlank()) return List.of();
        return toCandidates(mapper.searchCatalog(outletId, q.trim()), false);
    }

    public List<WineCandidate> search(TenantContext tenant, String q) {
        return search(tenant == null ? null : tenant.requireOutletId(), q);
    }

    public WineCandidate findById(Long id, Long outletId) {
        if (id == null) return null;
        List<WineCandidate> found = toCandidates(listOf(mapper.findById(id, outletId)), false);
        return found.isEmpty() ? null : found.get(0);
    }

    public WineCandidate findById(Long id, TenantContext tenant) {
        return findById(id, tenant == null ? null : tenant.requireOutletId());
    }

    private List<WineCandidate> toCandidates(List<CatalogRow> rows, boolean wineOnly) {
        if (rows == null || rows.isEmpty()) return List.of();
        List<WineCandidate> out = new ArrayList<>(rows.size());
        for (CatalogRow row : rows) {
            if (row == null || row.getId() == null) continue;
            boolean weightPackaged = WineLexicon.isWeightPackaged(row.getName(), row.getCategoryName(), row.getFamilyName());
            if (wineOnly && weightPackaged) continue;
            boolean knownNonWine = WineLexicon.isKnownNonWine(row.getName(), row.getCategoryName(), row.getFamilyName());
            boolean looksWine = !knownNonWine
                    && (WineLexicon.looksLikeWine(row.getName(), row.getCategoryName(), row.getFamilyName())
                    || row.getStoredWineType() != null);
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
        if (looksWine) {
            profile = mergeProductOrigin(profile, row);
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
                profile,
                row.getBarcode()
        );
    }

    private static WineProfile mergeProductOrigin(WineProfile profile, CatalogRow row) {
        boolean inferred = profile.inferred();
        String region = preferOrigin(profile.region(), row.getProductRegion(), inferred);
        String vintage = preferOrigin(profile.vintage(), row.getProductVintage(), inferred);
        return new WineProfile(
                profile.wineType(),
                profile.varietal(),
                region,
                vintage,
                profile.dryness(),
                profile.body(),
                profile.fruitiness(),
                profile.oak(),
                profile.tannin(),
                profile.aromaTags(),
                profile.palateTags(),
                profile.foodTags(),
                profile.finishNote(),
                inferred
        );
    }

    private static String preferOrigin(String profileValue, String productValue, boolean inferred) {
        return inferred
                ? firstNonBlank(productValue, profileValue)
                : firstNonBlank(profileValue, productValue);
    }

    private static String firstNonBlank(String preferred, String fallback) {
        return preferred == null || preferred.isBlank() ? fallback : preferred;
    }

    private WineProfile storedProfile(CatalogRow row) {
        if (row.getStoredWineType() == null || row.getStoredWineType().isBlank()) return null;
        return new WineProfile(
                WineLexicon.hasExplicitRoseStyle(row.getName(), row.getCategoryName(), row.getFamilyName())
                        ? "rose"
                        : row.getStoredWineType().toLowerCase(),
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
                !"curated".equalsIgnoreCase(row.getStoredProfileSource())
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

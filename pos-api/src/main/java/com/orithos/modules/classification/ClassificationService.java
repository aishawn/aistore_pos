package com.orithos.modules.classification;

import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessException;
import com.orithos.modules.classification.mapper.ClassificationMapper;
import com.orithos.modules.classification.mapper.ClassificationMapper.DailyQuantity;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ClassificationService {

    private static final Logger log = LoggerFactory.getLogger(ClassificationService.class);
    private static final int PERFORMANCE_DAYS = 30;

    private final ClassificationMapper mapper;
    private final ProductMapper productMapper;

    public ClassificationService(ClassificationMapper mapper, ProductMapper productMapper) {
        this.mapper = mapper;
        this.productMapper = productMapper;
    }

    public List<Classification> list(String type, String name) {
        Long outletId = requireOutlet();
        ClassificationType ct = ClassificationType.from(type);
        List<Classification> items = mapper.list(ct, blankToNull(name), outletId);
        for (Classification item : items) {
            item.setType(ct.table());
        }
        attachPerformance(ct, items, outletId);
        return items;
    }

    public List<MdbReference> mdbReferences(String type) {
        return mapper.listMdbReferences(ClassificationType.from(type).table(), requireOutlet());
    }

    public Classification get(String type, Long id) {
        Long outletId = requireOutlet();
        ClassificationType ct = ClassificationType.from(type);
        Classification item = requireVisible(ct, id, outletId);
        item.setType(ct.table());
        item.setProductCount(mapper.countProducts(ct, id, outletId));
        attachPerformance(ct, List.of(item), outletId);
        return item;
    }

    public Classification create(String type, Classification body) {
        Long outletId = requireOutlet();
        if (body == null || body.getName() == null || body.getName().isBlank()) {
            throw new BusinessException(40002, "Name is required.");
        }
        ClassificationType ct = ClassificationType.from(type);
        Classification row = new Classification();
        row.setName(body.getName().trim());
        row.setMdbId(body.getMdbId());
        mapper.insert(ct.table(), row, outletId);
        row.setType(ct.table());
        row.setProductCount(0);
        row.setPerformance30d(zeroSeries());
        return row;
    }

    public Classification update(String type, Long id, Classification body) {
        Long outletId = requireOutlet();
        if (body == null || body.getName() == null || body.getName().isBlank()) {
            throw new BusinessException(40002, "Name is required.");
        }
        ClassificationType ct = ClassificationType.from(type);
        Classification existing = requireVisible(ct, id, outletId);
        existing.setName(body.getName().trim());
        existing.setMdbId(body.getMdbId());
        mapper.updateById(ct.table(), existing);
        existing.setType(ct.table());
        existing.setProductCount(mapper.countProducts(ct, id, outletId));
        return existing;
    }

    public void delete(String type, Long id) {
        Long outletId = requireOutlet();
        ClassificationType ct = ClassificationType.from(type);
        requireVisible(ct, id, outletId);
        if (mapper.countProducts(ct, id, outletId) > 0) {
            throw new BusinessException(
                    "This classification is linked to products and cannot be deleted. "
                            + "Remove the product associations first.");
        }
        mapper.softDeleteById(ct.table(), id);
    }

    @Transactional
    public void setProducts(String type, Long id, List<Long> productIds) {
        Long outletId = requireOutlet();
        ClassificationType ct = ClassificationType.from(type);
        requireVisible(ct, id, outletId);
        List<Long> ids = productIds == null ? List.of() : productIds.stream()
                .filter(pid -> pid != null && pid > 0)
                .distinct()
                .toList();
        switch (ct) {
            case BRAND -> {
                productMapper.clearBrandAssignment(id);
                if (!ids.isEmpty()) productMapper.assignBrandProducts(id, ids);
            }
            case CATEGORY -> {
                productMapper.clearCategoryAssignment(id);
                if (!ids.isEmpty()) productMapper.assignCategoryProducts(id, ids);
            }
            case FAMILY -> {
                productMapper.clearFamilyAssignment(id);
                if (!ids.isEmpty()) productMapper.assignFamilyProducts(id, ids);
            }
            case TAG -> {
                productMapper.clearTagAssignment(id);
                if (!ids.isEmpty()) productMapper.assignTagProducts(id, ids);
            }
        }
    }

    private Classification requireVisible(ClassificationType type, Long id, Long outletId) {
        Classification item = mapper.findVisible(type, id, outletId);
        if (item == null) {
            throw new BusinessException(40401, "Classification not found.");
        }
        return item;
    }

    private void attachPerformance(ClassificationType type, List<Classification> items, Long outletId) {
        if (items == null || items.isEmpty()) {
            return;
        }
        List<Long> ids = items.stream()
                .map(Classification::getId)
                .filter(id -> id != null && id > 0)
                .distinct()
                .toList();
        Map<Long, List<BigDecimal>> series = new HashMap<>();
        for (Long id : ids) {
            series.put(id, zeroSeries());
        }
        if (!ids.isEmpty()) {
            try {
                LocalDate endInclusive = AustraliaTime.today();
                LocalDate start = endInclusive.minusDays(PERFORMANCE_DAYS - 1L);
                String from = start.toString();
                String to = endInclusive.plusDays(1).toString();
                List<DailyQuantity> rows = switch (type) {
                    case BRAND -> mapper.brandSalesByDay(ids, outletId, from, to);
                    case CATEGORY -> mapper.categorySalesByDay(ids, outletId, from, to);
                    case FAMILY -> mapper.familySalesByDay(ids, outletId, from, to);
                    case TAG -> mapper.tagSalesByDay(ids, outletId, from, to);
                };
                if (rows != null) {
                    for (DailyQuantity row : rows) {
                        if (row.getClassificationId() == null || row.getDay() == null) {
                            continue;
                        }
                        List<BigDecimal> values = series.get(row.getClassificationId());
                        if (values == null) {
                            continue;
                        }
                        long index = java.time.temporal.ChronoUnit.DAYS.between(start, row.getDay());
                        if (index < 0 || index >= PERFORMANCE_DAYS) {
                            continue;
                        }
                        BigDecimal quantity = row.getQuantity() == null ? BigDecimal.ZERO : row.getQuantity();
                        values.set((int) index, quantity.setScale(2, RoundingMode.HALF_UP));
                    }
                }
            } catch (RuntimeException ex) {
                // Keep the classifications table usable even if sparkline sales SQL fails.
                log.warn("Classification performance series unavailable for type={} outletId={}: {}",
                        type.table(), outletId, ex.toString());
            }
        }
        for (Classification item : items) {
            if (item.getId() == null) {
                item.setPerformance30d(zeroSeries());
            } else {
                item.setPerformance30d(series.getOrDefault(item.getId(), zeroSeries()));
            }
        }
    }

    private static List<BigDecimal> zeroSeries() {
        List<BigDecimal> values = new ArrayList<>(PERFORMANCE_DAYS);
        for (int i = 0; i < PERFORMANCE_DAYS; i++) {
            values.add(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        }
        return values;
    }

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) {
            throw new BusinessException(40100, "Authenticated outlet is required.");
        }
        return outletId;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}

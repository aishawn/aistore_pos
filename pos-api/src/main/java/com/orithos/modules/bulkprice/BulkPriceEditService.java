package com.orithos.modules.bulkprice;

import com.orithos.common.PageResult;
import com.orithos.common.PriceQuantityUtils;
import com.orithos.modules.bulkprice.mapper.BulkPriceEditMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class BulkPriceEditService {

    private final BulkPriceEditMapper mapper;

    public BulkPriceEditService(BulkPriceEditMapper mapper) {
        this.mapper = mapper;
    }

    public PageResult<BulkPriceEditRow> page(BulkPriceEditQuery q) {
        List<BulkPriceEditRow> rows = mapper.page(q);
        if (!rows.isEmpty()) {
            List<Long> ids = rows.stream().map(BulkPriceEditRow::getProductId).toList();
            Map<Long, List<BulkPriceEditRow.BulkPriceBreak>> byProduct = new LinkedHashMap<>();
            for (BulkPriceEditMapper.PriceRow pr : mapper.listPrices(ids)) {
                byProduct.computeIfAbsent(pr.getProductId(), k -> new ArrayList<>()).add(toBreak(pr));
            }
            for (BulkPriceEditRow row : rows) {
                row.setPrices(byProduct.getOrDefault(row.getProductId(), List.of()));
            }
        }
        return PageResult.of(rows, mapper.count(q), q.getPage(), q.getSize());
    }

    public void upsertPrice(Long productId, BigDecimal quantity, BigDecimal price, Long priceId) {
        if (productId == null || quantity == null || price == null) {
            throw new IllegalArgumentException("productId, quantity and price are required");
        }
        PriceQuantityUtils.validateRow(quantity, price);
        if (priceId != null) {
            mapper.updatePrice(priceId, price);
            return;
        }
        Long existing = mapper.findPriceId(productId, quantity);
        if (existing != null) {
            mapper.updatePrice(existing, price);
        } else {
            mapper.insertPrice(productId, quantity, price);
        }
    }

    private static BulkPriceEditRow.BulkPriceBreak toBreak(BulkPriceEditMapper.PriceRow pr) {
        BulkPriceEditRow.BulkPriceBreak b = new BulkPriceEditRow.BulkPriceBreak();
        b.setPriceId(pr.getPriceId());
        b.setQuantity(pr.getQuantity());
        b.setPrice(pr.getPrice());
        return b;
    }

    public record PriceUpdate(Long productId, Long priceId, BigDecimal quantity, BigDecimal price) {}
}

package com.orithos.modules.stocklist;

import com.orithos.common.CsvUtils;
import com.orithos.common.PriceQuantityUtils;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.stocklist.mapper.StockListMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
public class StockListService {

    private final StockListMapper mapper;
    private final ProductMapper productMapper;
    private final ProductService productService;

    public StockListService(StockListMapper mapper,
                            ProductMapper productMapper,
                            ProductService productService) {
        this.mapper = mapper;
        this.productMapper = productMapper;
        this.productService = productService;
    }

    public List<StockListRow> page(StockListQuery q) {
        return mapper.page(q);
    }

    public long count(StockListQuery q) {
        return mapper.count(q);
    }

    public byte[] exportCsv(StockListQuery q) {
        q.setPage(1);
        q.setSize(Integer.MAX_VALUE);
        List<StockListRow> rows = mapper.export(q);
        StringBuilder sb = new StringBuilder();
        sb.append(CsvUtils.headerRow(
                "Product", "Category", "Price Set", "Case Quantity", "Cases on Hand",
                "Items on Hand", "Quantity", "Cost", "Price", "Profit %"
        )).append('\n');
        for (StockListRow r : rows) {
            sb.append(CsvUtils.row(
                    r.getName(),
                    r.getCategoryName(),
                    r.getPriceSetName(),
                    r.getCaseQuantity(),
                    r.getCasesOnHand(),
                    r.getItemsOnHand(),
                    r.getPriceQuantity(),
                    r.getCost(),
                    r.getPrice(),
                    formatProfit(r.getCost(), r.getPrice())
            )).append('\n');
        }
        return CsvUtils.toUtf8Bytes(sb.toString());
    }

    public void updateRow(Long productId, StockListUpdate body) {
        if (body.name() != null || body.cost() != null || body.caseQuantity() != null) {
            var product = productMapper.findById(productId);
            if (product == null) return;
            if (body.name() != null) product.setName(body.name());
            if (body.cost() != null) product.setCost(body.cost());
            if (body.caseQuantity() != null) product.setCaseQuantity(body.caseQuantity());
            productService.update(product);
        }
        if (body.priceId() != null && (body.price() != null || body.priceQuantity() != null)) {
            BigDecimal quantity = body.priceQuantity() != null ? body.priceQuantity() : BigDecimal.ONE;
            PriceQuantityUtils.validateRow(quantity, body.price());
            mapper.updatePrice(
                    body.priceId(),
                    body.price(),
                    quantity
            );
        }
    }

    private static String formatProfit(BigDecimal cost, BigDecimal price) {
        if (cost == null || price == null || price.compareTo(BigDecimal.ZERO) <= 0) {
            return "";
        }
        BigDecimal profit = price.subtract(cost)
                .divide(price, 4, RoundingMode.HALF_UP)
                .multiply(BigDecimal.valueOf(100));
        return profit.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    public record StockListUpdate(
            String name,
            BigDecimal cost,
            BigDecimal caseQuantity,
            Long priceId,
            BigDecimal price,
            BigDecimal priceQuantity
    ) {}
}

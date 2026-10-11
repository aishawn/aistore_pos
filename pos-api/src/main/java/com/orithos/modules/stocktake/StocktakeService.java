package com.orithos.modules.stocktake;

import com.orithos.common.BusinessException;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
public class StocktakeService {

    private final StocktakeMapper mapper;
    private final OutletMapper outletMapper;
    private final ProductMapper productMapper;

    public StocktakeService(StocktakeMapper mapper, OutletMapper outletMapper, ProductMapper productMapper) {
        this.mapper = mapper;
        this.outletMapper = outletMapper;
        this.productMapper = productMapper;
    }

    /** Start or resume an in-progress express stocktake for the given outlet. */
    @Transactional
    public ExpressStocktakeDetail startExpress(Long outletId) {
        if (outletId == null) {
            throw new BusinessException("Outlet is required");
        }
        Outlet outlet = outletMapper.findById(outletId);
        if (outlet == null || outlet.getDeletedAt() != null) {
            throw new BusinessException("Outlet not found");
        }

        Stocktake stocktake = mapper.findInProgressExpress(outletId);
        if (stocktake == null) {
            stocktake = new Stocktake();
            stocktake.setName("Express Stocktake");
            stocktake.setType("EXPRESS");
            stocktake.setOutletId(outletId);
            stocktake.setStatus("IN_PROGRESS");
            stocktake.setDisplayExpected(false);
            stocktake.setApplied(false);
            mapper.insert(stocktake);
        }

        return toExpressDetail(stocktake, outlet.getName());
    }

    public ExpressStocktakeDetail getExpressDetail(Long id) {
        Stocktake stocktake = requireStocktake(id);
        Outlet outlet = outletMapper.findById(stocktake.getOutletId());
        String outletName = outlet != null ? outlet.getName() : "";
        return toExpressDetail(stocktake, outletName);
    }

    public List<StocktakeProductSearchHit> searchProducts(Long stocktakeId, String query) {
        requireStocktake(stocktakeId);
        String term = query == null ? "" : query.trim();
        if (term.isEmpty()) {
            return List.of();
        }
        return mapper.searchProducts(term, 20);
    }

    @Transactional
    public ExpressStocktakeDetail scanProduct(Long stocktakeId, ScanProductRequest req) {
        Stocktake stocktake = requireStocktake(stocktakeId);
        if (!"IN_PROGRESS".equals(stocktake.getStatus())) {
            throw new BusinessException("Stocktake is not in progress");
        }

        Product product = resolveProduct(req);
        addOrIncrementProduct(stocktake, product);

        Outlet outlet = outletMapper.findById(stocktake.getOutletId());
        return toExpressDetail(stocktake, outlet != null ? outlet.getName() : "");
    }

    private Product resolveProduct(ScanProductRequest req) {
        if (req.getProductId() != null) {
            Product product = productMapper.findById(req.getProductId());
            if (product == null || !"ACTIVE".equals(product.getStatus())) {
                throw new BusinessException("Product not found");
            }
            return product;
        }

        String query = req.getQuery() == null ? "" : req.getQuery().trim();
        if (query.isEmpty()) {
            throw new BusinessException("Product is required");
        }

        Product byBarcode = mapper.findProductByBarcode(query);
        if (byBarcode != null) {
            return byBarcode;
        }

        List<StocktakeProductSearchHit> hits = mapper.searchProducts(query, 2);
        if (hits.isEmpty()) {
            throw new BusinessException("No matching product found");
        }
        if (hits.size() > 1) {
            throw new BusinessException("Multiple products match — select one from the list");
        }

        Product product = productMapper.findById(hits.get(0).getId());
        if (product == null) {
            throw new BusinessException("Product not found");
        }
        return product;
    }

    private void addOrIncrementProduct(Stocktake stocktake, Product product) {
        int updated = mapper.incrementActualCount(
                stocktake.getId(),
                product.getId(),
                BigDecimal.ONE);
        if (updated > 0) {
            return;
        }

        BigDecimal expected = mapper.findInventoryQuantity(product.getId(), stocktake.getOutletId());
        if (expected == null) {
            expected = BigDecimal.ZERO;
        }
        BigDecimal cost = product.getCost() != null ? product.getCost() : BigDecimal.ZERO;
        BigDecimal caseQty = product.getCaseQuantity() != null ? product.getCaseQuantity() : BigDecimal.ONE;

        StocktakeProduct line = new StocktakeProduct();
        line.setStocktakeId(stocktake.getId());
        line.setProductId(product.getId());
        line.setCost(cost);
        line.setCaseQuantity(caseQty);
        line.setScanned(true);
        line.setExpectedCount(expected);
        line.setExpectedValue(expected.multiply(cost));
        line.setActualCount(BigDecimal.ONE);
        line.setActualValue(cost);
        mapper.insertProduct(line);
    }

    private Stocktake requireStocktake(Long id) {
        Stocktake stocktake = mapper.findById(id);
        if (stocktake == null) {
            throw new BusinessException("Stocktake not found");
        }
        return stocktake;
    }

    private ExpressStocktakeDetail toExpressDetail(Stocktake stocktake, String outletName) {
        ExpressStocktakeDetail detail = new ExpressStocktakeDetail();
        detail.setId(stocktake.getId());
        detail.setName(stocktake.getName());
        detail.setOutletId(stocktake.getOutletId());
        detail.setOutletName(outletName);
        detail.setStatus(stocktake.getStatus());
        detail.setType(stocktake.getType());
        detail.setDisplayExpected(stocktake.getDisplayExpected());
        detail.setProducts(mapper.findProductLines(stocktake.getId()));
        return detail;
    }
}

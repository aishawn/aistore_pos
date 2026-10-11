package com.orithos.modules.sell;

import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessException;
import com.orithos.common.SqlLikeUtils;
import com.orithos.modules.customer.Customer;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductQuery;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.sale.Sale;
import com.orithos.modules.sale.SaleItem;
import com.orithos.modules.sale.SaleMapper;
import com.orithos.modules.sell.dto.*;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Point-of-sale operations for the Sell pad: unified search, park / resume,
 * and register actions (open drawer, case quantity lookup).
 */
@Service
public class SellService {

    private final ProductMapper productMapper;
    private final CustomerMapper customerMapper;
    private final SaleMapper saleMapper;

    public SellService(ProductMapper productMapper, CustomerMapper customerMapper, SaleMapper saleMapper) {
        this.productMapper = productMapper;
        this.customerMapper = customerMapper;
        this.saleMapper = saleMapper;
    }

    /** Search products and customers for the Sell-pad search bar. */
    public SellSearchResponse search(String q) {
        String term = SqlLikeUtils.prepareLikeSearch(q);
        SellSearchResponse res = new SellSearchResponse();
        res.setProducts(new ArrayList<>());
        res.setCustomers(new ArrayList<>());
        if (term == null) return res;

        ProductQuery pq = new ProductQuery();
        pq.setName(term);
        pq.setStatus("ACTIVE");
        pq.setPage(1);
        pq.setSize(10);
        for (Product p : productMapper.page(pq)) {
            SellSearchResponse.ProductHit hit = new SellSearchResponse.ProductHit();
            hit.setId(p.getId());
            hit.setName(p.getName());
            hit.setPrice(p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO);
            hit.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
            res.getProducts().add(hit);
        }

        for (Customer c : customerMapper.page(term, Collections.emptyList(), false, false,
                null, false, false, null, null, null, 10, 0)) {
            SellSearchResponse.CustomerHit hit = new SellSearchResponse.CustomerHit();
            hit.setId(c.getId());
            hit.setName(c.getName());
            hit.setGroupName(c.getCustomerGroupName());
            hit.setLoyaltyPoints(c.getLoyaltyPoints() != null ? c.getLoyaltyPoints() : BigDecimal.ZERO);
            res.getCustomers().add(hit);
        }
        return res;
    }

    /** List parked (suspended) sales for the Parked Sales tab. */
    public List<Sale> listParked() {
        expireOverdueParkedSales();
        LocalDate today = AustraliaTime.today();
        List<Sale> parked = saleMapper.page("PARKED", null, 50, 0);
        for (Sale sale : parked) {
            LocalDate parkedOn = parkedBusinessDate(sale);
            sale.setStale(ParkedSalePolicy.stale(parkedOn, today));
            sale.setClearsOn(ParkedSalePolicy.clearsOn(parkedOn));
        }
        return parked;
    }

    /**
     * Void parked sales from before yesterday's Sydney business day.
     * Called when the register lists parked sales and on a 15-minute schedule.
     */
    public int expireOverdueParkedSales() {
        LocalDate today = AustraliaTime.today();
        return saleMapper.expireParkedBefore(
                ParkedSalePolicy.expireBefore(today),
                ParkedSalePolicy.createdBeforeUtc(today));
    }

    private static LocalDate parkedBusinessDate(Sale sale) {
        if (sale.getBusinessDate() != null) return sale.getBusinessDate();
        if (sale.getCreatedAt() == null) return null;
        return AustraliaTime.fromUtcWall(sale.getCreatedAt()).toLocalDate();
    }

    /** Load a parked sale with its line items (for resume). */
    public Sale getParked(Long id) {
        Sale sale = saleMapper.findById(id);
        if (sale == null || !"PARKED".equals(sale.getStatus())) {
            throw new BusinessException("Parked sale not found.");
        }
        sale.setItems(saleMapper.findItemsBySaleId(id));
        return sale;
    }

    /** Park the current cart — persists as status PARKED and returns the sale. */
    @Transactional
    public Sale park(ParkSaleRequest req) {
        if (req.getItems() == null || req.getItems().isEmpty()) {
            throw new BusinessException("Cannot park an empty sale.");
        }

        BigDecimal total = BigDecimal.ZERO;
        int quantity = 0;
        for (SellCartItem item : req.getItems()) {
            BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
            BigDecimal unit = item.getUnitPrice() == null ? BigDecimal.ZERO : item.getUnitPrice();
            total = total.add(qty.multiply(unit));
            quantity += qty.intValue();
        }
        total = total.setScale(2, RoundingMode.HALF_UP);

        Sale sale = new Sale();
        sale.setStatus("PARKED");
        sale.setRegisterId(req.getRegisterId());
        sale.setUserId(req.getUserId() != null ? req.getUserId() : CurrentUser.id());
        sale.setCustomerId(resolveCustomerId(req.getCustomerId()));
        sale.setNote(req.getNote());
        sale.setTotalQuantity(quantity);
        sale.setTotalPrice(total);
        sale.setOutstanding(total);
        sale.setBusinessDate(AustraliaTime.today());
        sale.setLocalSoldAt(AustraliaTime.localNow());
        saleMapper.insert(sale);

        for (SellCartItem item : req.getItems()) {
            insertCartItem(sale.getId(), item);
        }
        sale.setItems(saleMapper.findItemsBySaleId(sale.getId()));
        return sale;
    }

    /**
     * Resume a parked sale: return cart data and void the parked record so it
     * leaves the Parked Sales list (the operator now works in-memory).
     */
    @Transactional
    public Sale resume(Long id) {
        Sale sale = getParked(id);
        saleMapper.voidParked(id);
        return sale;
    }

    /** Discard a parked sale without restoring lines to the cart. */
    @Transactional
    public void voidParked(Long id) {
        Sale sale = saleMapper.findById(id);
        if (sale == null || !"PARKED".equals(sale.getStatus())) {
            throw new BusinessException("Parked sale not found.");
        }
        saleMapper.voidParked(id);
    }

    /** Execute a register action triggered from a Sell-pad key. */
    public SellActionResponse executeAction(SellActionRequest req) {
        if (req.getAction() == null) {
            throw new BusinessException("Action is required.");
        }
        String action = req.getAction().toUpperCase().replace(' ', '_');

        SellActionResponse res = new SellActionResponse();
        res.setAction(action);

        switch (action) {
            case "OPEN_DRAWER", "OPEN_CASH_DRAWER" -> {
                res.setSuccess(true);
                res.setMessage("Cash drawer opened.");
            }
            case "CASE_QUANTITY" -> {
                BigDecimal caseQty = BigDecimal.valueOf(24);
                if (req.getProductId() != null) {
                    Product p = productMapper.findById(req.getProductId());
                    if (p != null && p.getCaseQuantity() != null && p.getCaseQuantity().signum() > 0) {
                        caseQty = p.getCaseQuantity();
                    }
                }
                res.setSuccess(true);
                res.setCaseQuantity(caseQty);
                res.setMessage("Case quantity: " + caseQty.intValue());
            }
            case "RETURN_AN_ITEM" -> {
                res.setSuccess(true);
                res.setMessage("Select a line and use Return an Item to reverse it.");
            }
            case "ADD_NOTE" -> {
                res.setSuccess(true);
                res.setMessage("Sale note saved.");
            }
            case "PRODUCT_DETAILS" -> {
                res.setSuccess(true);
                res.setMessage("Select a cart line to view product details.");
            }
            case "RELOAD_INVOICE" -> {
                res.setSuccess(true);
                res.setMessage("Open History to reload a previous invoice.");
            }
            case "GIFT_CARD" -> {
                res.setSuccess(true);
                res.setMessage("Opening gift cards…");
            }
            case "CUSTOMER_PAYMENT" -> {
                res.setSuccess(true);
                res.setMessage("Select a customer first, then record a payment.");
            }
            case "LIVE_PROFIT" -> {
                res.setSuccess(true);
                res.setMessage("Opening sales reports…");
            }
            case "VIEW_PROMOTIONS", "PRODUCTS", "BEER", "WINES", "SPIRITS", "CREATE_CUSTOMER" -> {
                res.setSuccess(true);
                res.setMessage(action.replace('_', ' ') + " opened.");
            }
            default -> {
                res.setSuccess(true);
                res.setMessage("Action recorded: " + action);
            }
        }
        return res;
    }

    /**
     * Browse products for a Sell-pad folder (Beer / Wines / Spirits / Products).
     * Stem matching is prefix-based on category or family name so "Beer" includes
     * "Beer Local" and the Beer family.
     */
    public ProductBrowseResponse browseProducts(String category, String q) {
        String folder = category == null || category.isBlank() ? "Products" : category.trim();
        String stem = null;
        if (!"Products".equalsIgnoreCase(folder)) {
            // Beer→Beer, Wines→Wine, Spirits→Spirit (matches Spirits via LIKE Spirit%)
            stem = folder.replaceAll("(?i)s$", "");
            if (stem.isBlank()) stem = folder;
        }

        ProductBrowseResponse res = new ProductBrowseResponse();
        res.setFolderName(
                stem == null ? "Products" : "Products In " + folder.toUpperCase());

        String nameFilter = q == null || q.isBlank() ? null : q.trim();
        for (Product p : productMapper.browseForSell(stem, nameFilter)) {
            ProductBrowseResponse.Item item = new ProductBrowseResponse.Item();
            item.setId(p.getId());
            item.setName(p.getName());
            item.setPrice(p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO);
            item.setCategoryName(p.getCategoryName());
            item.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
            res.getItems().add(item);
        }
        return res;
    }

    /**
     * Resolve a sale-key label to one active product.
     * Price is the catalogue unit price (lowest quantity break in product_price),
     * the same figure shown on the Products list. No price-set or hardcoded override.
     * Returns null when the name is missing, ambiguous, or not an exact product name.
     * A product with no catalogue price is still returned so the till can refuse it
     * instead of selling at $0.
     */
    public SellSearchResponse.ProductHit findQuickKeyProduct(String key) {
        if (key == null || key.isBlank()) return null;
        List<Product> hits = productMapper.findActiveByExactName(key.trim());
        if (hits.size() != 1) return null;
        Product p = hits.get(0);
        SellSearchResponse.ProductHit hit = new SellSearchResponse.ProductHit();
        hit.setId(p.getId());
        hit.setName(p.getName());
        hit.setPrice(p.getPrice());
        hit.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
        return hit;
    }

    /** Catalogue price for a sale key that is bound to a product id. */
    public SellSearchResponse.ProductHit findQuickKeyProductById(Long id) {
        if (id == null) return null;
        Product p = productMapper.findActiveForSell(id);
        if (p == null) return null;
        SellSearchResponse.ProductHit hit = new SellSearchResponse.ProductHit();
        hit.setId(p.getId());
        hit.setName(p.getName());
        hit.setPrice(p.getPrice());
        hit.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
        return hit;
    }

    private void insertCartItem(Long saleId, SellCartItem item) {
        SaleItem si = new SaleItem();
        si.setSaleId(saleId);
        BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
        BigDecimal unit = item.getUnitPrice() == null ? BigDecimal.ZERO : item.getUnitPrice();
        si.setQuantity(qty);
        si.setBasePrice(unit);
        si.setTotalPrice(qty.multiply(unit).setScale(2, RoundingMode.HALF_UP));
        if (item.getProductId() != null && saleMapper.productExists(item.getProductId()) > 0) {
            si.setProductId(item.getProductId());
        } else {
            si.setNote(item.getName());
        }
        saleMapper.insertItem(si);
    }

    private Long resolveCustomerId(Long customerId) {
        if (customerId != null && saleMapper.customerExists(customerId) > 0) {
            return customerId;
        }
        return null;
    }
}

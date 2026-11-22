package com.orithos.modules.sell;

import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.common.BusinessException;
import com.orithos.common.SqlLikeUtils;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
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
    private final CompanySettingsService companySettings;
    private final BusinessTimezoneService businessTimezone;
    private final boolean nativePosOnlyMode;

    public SellService(ProductMapper productMapper, CustomerMapper customerMapper, SaleMapper saleMapper) {
        this(productMapper, customerMapper, saleMapper, null, null, false);
    }

    @Autowired
    public SellService(ProductMapper productMapper, CustomerMapper customerMapper, SaleMapper saleMapper,
                       CompanySettingsService companySettings,
                       BusinessTimezoneService businessTimezone,
                       @Value("${app.native-pos-only-mode:true}") boolean nativePosOnlyMode) {
        this.productMapper = productMapper;
        this.customerMapper = customerMapper;
        this.saleMapper = saleMapper;
        this.companySettings = companySettings;
        this.businessTimezone = businessTimezone;
        this.nativePosOnlyMode = nativePosOnlyMode;
    }

    public SellService(ProductMapper productMapper, CustomerMapper customerMapper, SaleMapper saleMapper,
                       boolean nativePosOnlyMode) {
        this(productMapper, customerMapper, saleMapper, null, null, nativePosOnlyMode);
    }

    public SellService(ProductMapper productMapper, CustomerMapper customerMapper, SaleMapper saleMapper,
                       CompanySettingsService companySettings, boolean nativePosOnlyMode) {
        this(productMapper, customerMapper, saleMapper, companySettings, null, nativePosOnlyMode);
    }

    private LocalDate today(Long vendorId) {
        return businessTimezone == null ? AustraliaTime.today() : businessTimezone.today(vendorId);
    }

    private java.time.LocalDateTime localNow(Long vendorId) {
        return businessTimezone == null ? AustraliaTime.localNow() : businessTimezone.localNow(vendorId);
    }

    private LocalDate parkedBusinessDate(Sale sale, Long vendorId) {
        if (sale.getBusinessDate() != null) return sale.getBusinessDate();
        if (sale.getCreatedAt() == null) return null;
        return businessTimezone == null ? AustraliaTime.fromUtcWall(sale.getCreatedAt()).toLocalDate()
                : businessTimezone.fromUtcWall(sale.getCreatedAt(), vendorId).toLocalDate();
    }

    /** Search products and customers for the Sell-pad search bar. */
    public SellSearchResponse search(String q) {
        Long vendorId = requireVendorId();
        Long outletId = requireOutletId();
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
        pq.setVendorId(vendorId);
        pq.setOutletId(outletId);
        for (Product p : productMapper.page(pq)) {
            SellSearchResponse.ProductHit hit = new SellSearchResponse.ProductHit();
            hit.setId(p.getId());
            hit.setName(p.getName());
            hit.setPrice(p.getPrice() != null ? p.getPrice() : BigDecimal.ZERO);
            hit.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
            res.getProducts().add(hit);
        }

        for (Customer c : customerMapper.searchForSell(term, vendorId, outletId)) {
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
        Long vendorId = requireVendorId();
        Long outletId = requireOutletId();
        LocalDate today = today(vendorId);
        List<Sale> parked = saleMapper.page(vendorId, outletId, "PARKED", null, 50, 0);
        for (Sale sale : parked) {
            LocalDate parkedOn = parkedBusinessDate(sale, vendorId);
            sale.setStale(ParkedSalePolicy.stale(parkedOn, today));
            sale.setClearsOn(ParkedSalePolicy.clearsOn(parkedOn));
        }
        return parked;
    }

    /**
     * Void parked sales from before yesterday's outlet business day.
     * Called by the scheduled cleanup job every 15 minutes.
     */
    public int expireOverdueParkedSales() {
        int expired = 0;
        for (Long vendorId : saleMapper.findParkedVendorIds()) {
            LocalDate today = today(vendorId);
            java.time.ZoneId zone = businessTimezone == null
                    ? java.time.ZoneId.of("Australia/Melbourne") : businessTimezone.zoneForVendor(vendorId);
            expired += saleMapper.expireParkedBefore(vendorId,
                    ParkedSalePolicy.expireBefore(today),
                    ParkedSalePolicy.createdBeforeUtc(today, zone));
        }
        return expired;
    }

    /** Load a parked sale with its line items (for resume). */
    public Sale getParked(Long id) {
        Sale sale = saleMapper.findById(id, CurrentUser.vendorId(), CurrentUser.outletId());
        if (sale == null || !"PARKED".equals(sale.getStatus())) {
            throw new BusinessException("Parked sale not found.");
        }
        sale.setItems(saleMapper.findItemsBySaleId(id));
        return sale;
    }

    /** Park the current cart — persists as status PARKED and returns the sale. */
    @Transactional
    public Sale park(ParkSaleRequest req) {
        if (req == null) throw new BusinessException(40000, "Park sale request is required.");
        if (req.getItems() == null || req.getItems().isEmpty()) {
            throw new BusinessException("Cannot park an empty sale.");
        }
        boolean noteRequired = companySettings != null
                && companySettings.getBoolean(CompanySettingsKeys.REQUIRE_NOTE_ON_PARKED_SALE, false);
        String note = req.getNote() == null ? null : req.getNote().trim();
        if (noteRequired && (note == null || note.isEmpty())) {
            throw new BusinessException(40000, "A note is required when parking this sale.");
        }

        Long vendorId = requireVendorId();
        Long outletId = requireOutletId();
        BigDecimal total = BigDecimal.ZERO;
        int quantity = 0;
        List<Product> products = new ArrayList<>();
        for (SellCartItem item : req.getItems()) {
            if (item == null || item.getProductId() == null) {
                throw new BusinessException(40000, "Each parked line must reference a catalogue product.");
            }
            BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
            if (qty.signum() <= 0) throw new BusinessException(40000, "Sale quantity must be greater than zero.");
            Product product = productMapper.findSellableForOutlet(item.getProductId(), vendorId, outletId, qty);
            if (product == null) throw new BusinessException("Product is not available at this outlet.");
            BigDecimal unit = product.getPrice();
            if (unit == null || unit.signum() < 0) {
                throw new BusinessException("Product has no valid outlet price. Configure a price before selling.");
            }
            products.add(product);
            item.setName(product.getName());
            item.setUnitPrice(unit);
            total = total.add(qty.multiply(unit));
            quantity += qty.intValue();
        }
        total = total.setScale(2, RoundingMode.HALF_UP);

        Sale sale = new Sale();
        sale.setStatus("PARKED");
        sale.setOutletId(outletId);
        sale.setRegisterId(req.getRegisterId());
        sale.setUserId(CurrentUser.id());
        sale.setCustomerId(resolveCustomerId(req.getCustomerId()));
        sale.setNote(note == null || note.isEmpty() ? null : note);
        sale.setTotalQuantity(quantity);
        sale.setTotalPrice(total);
        sale.setOutstanding(total);
        sale.setBusinessDate(today(vendorId));
        sale.setLocalSoldAt(localNow(vendorId));
        saleMapper.insert(sale);

        for (int i = 0; i < req.getItems().size(); i++) {
            insertCartItem(sale.getId(), req.getItems().get(i), products.get(i));
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
        saleMapper.voidParked(id, CurrentUser.vendorId(), CurrentUser.outletId());
        return sale;
    }

    /** Discard a parked sale without restoring lines to the cart. */
    @Transactional
    public void voidParked(Long id) {
        Sale sale = saleMapper.findById(id, CurrentUser.vendorId(), CurrentUser.outletId());
        if (sale == null || !"PARKED".equals(sale.getStatus())) {
            throw new BusinessException("Parked sale not found.");
        }
        saleMapper.voidParked(id, CurrentUser.vendorId(), CurrentUser.outletId());
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
                    Product p = productMapper.findByIdAndOutlet(req.getProductId(),
                            requireVendorId(), requireOutletId());
                    if (p == null) throw new BusinessException("Product is not available at this outlet.");
                    if (p.getCaseQuantity() != null && p.getCaseQuantity().signum() > 0) {
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
        Long vendorId = requireVendorId();
        Long outletId = requireOutletId();
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
        for (Product p : productMapper.browseForSell(stem, nameFilter, vendorId, outletId)) {
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
        List<Product> hits = productMapper.findActiveByExactNameForOutlet(
                key.trim(), requireVendorId(), requireOutletId());
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
        Product p = productMapper.findActiveForOutlet(id, requireVendorId(), requireOutletId());
        if (p == null) return null;
        SellSearchResponse.ProductHit hit = new SellSearchResponse.ProductHit();
        hit.setId(p.getId());
        hit.setName(p.getName());
        hit.setPrice(p.getPrice());
        hit.setCaseQuantity(p.getCaseQuantity() != null ? p.getCaseQuantity() : BigDecimal.ONE);
        return hit;
    }

    private void insertCartItem(Long saleId, SellCartItem item, Product product) {
        SaleItem si = new SaleItem();
        si.setSaleId(saleId);
        si.setOutletId(CurrentUser.outletId());
        si.setProductId(product.getId());
        BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
        BigDecimal unit = product.getPrice();
        if (unit == null) throw new BusinessException("Product has no valid outlet price. Configure a price before selling.");
        si.setQuantity(qty);
        si.setCaseQuantity(product.getCaseQuantity());
        si.setBasePrice(unit);
        si.setTotalPrice(qty.multiply(unit).setScale(2, RoundingMode.HALF_UP));
        si.setNote(product.getName());
        saleMapper.insertItem(si);
    }

    private Long resolveCustomerId(Long customerId) {
        if (customerId != null && saleMapper.customerExists(customerId,
                requireVendorId(), requireOutletId()) > 0) {
            return customerId;
        }
        if (customerId != null) throw new BusinessException("Customer is not available at this outlet.");
        return null;
    }

    private static Long requireVendorId() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40100, "Authenticated vendor is required.");
        return vendorId;
    }

    private static Long requireOutletId() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }
}

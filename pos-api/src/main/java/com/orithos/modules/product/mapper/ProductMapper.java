package com.orithos.modules.product.mapper;

import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductBarcode;
import com.orithos.modules.product.ProductFilterOption;
import com.orithos.modules.product.ProductInventory;
import com.orithos.modules.product.ProductPrice;
import com.orithos.modules.product.ProductQuery;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.util.List;

/** XML-backed (see resources/mapper/ProductMapper.xml) for dynamic filtering. */
@Mapper
public interface ProductMapper {
    List<Product> page(@Param("q") ProductQuery q);
    long count(@Param("q") ProductQuery q);
    Product findById(@Param("id") Long id);

    @Select("SELECT p.* FROM product p JOIN outlet o ON o.id=p.outlet_id WHERE p.id=#{id} AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL AND p.deleted_at IS NULL")
    Product findByIdAndVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Select("SELECT p.* FROM product p JOIN outlet o ON o.id=p.outlet_id WHERE p.id=#{id} AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND o.deleted_at IS NULL AND p.deleted_at IS NULL")
    Product findByIdAndOutlet(@Param("id") Long id, @Param("vendorId") Long vendorId,
                              @Param("outletId") Long outletId);
    int insert(@Param("p") Product p);
    int update(@Param("p") Product p);
    int updateStatus(@Param("id") Long id, @Param("status") String status);
    int softDelete(@Param("id") Long id);
    int bulkSoftDelete(@Param("ids") List<Long> ids);

    // ---- merge: reassign transactional/historical references from a source product to the target ----
    @Update("UPDATE sale_item SET product_id=#{target} WHERE product_id=#{source}")
    int reassignSaleItem(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE order_product SET product_id=#{target} WHERE product_id=#{source}")
    int reassignOrderProduct(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE stocktake_product SET product_id=#{target} WHERE product_id=#{source}")
    int reassignStocktakeProduct(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE product_barcode SET product_id=#{target} WHERE product_id=#{source}")
    int reassignBarcode(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE future_price SET product_id=#{target} WHERE product_id=#{source}")
    int reassignFuturePrice(@Param("target") Long target, @Param("source") Long source);

    @Update("UPDATE future_cost SET product_id=#{target} WHERE product_id=#{source}")
    int reassignFutureCost(@Param("target") Long target, @Param("source") Long source);

    // ---- inventory adjustment (upsert on composite PK product_id + outlet_id) ----
    @Update("INSERT INTO product_inventory (product_id, outlet_id, quantity) "
            + "VALUES (#{productId}, #{outletId}, #{quantity}) "
            + "ON CONFLICT (product_id, outlet_id) DO UPDATE SET quantity = product_inventory.quantity + EXCLUDED.quantity")
    int adjustInventory(@Param("productId") Long productId,
                        @Param("outletId") Long outletId,
                        @Param("quantity") BigDecimal quantity);

    /** Apply a negative delta only when on-hand stays at or above zero. */
    @Update("UPDATE product_inventory SET quantity = quantity + #{quantity} "
            + "WHERE product_id = #{productId} AND outlet_id = #{outletId} "
            + "AND quantity + #{quantity} >= 0")
    int adjustInventoryIfAvailable(@Param("productId") Long productId,
                                   @Param("outletId") Long outletId,
                                   @Param("quantity") BigDecimal quantity);

    // ---- barcodes ----
    @Insert("INSERT INTO product_barcode (product_id, code) VALUES (#{productId}, #{barcode})")
    int insertBarcode(@Param("productId") Long productId,
                      @Param("barcode") String barcode);

    @Select("SELECT COUNT(*) FROM product_barcode WHERE code = #{code}")
    long countByBarcode(@Param("code") String code);

    @Select("SELECT product_id FROM product_barcode WHERE code = #{code} LIMIT 1")
    Long findProductIdByBarcode(@Param("code") String code);

    @Delete("DELETE FROM product_barcode WHERE id = #{id}")
    int deleteBarcode(@Param("id") Long id);

    // ---- tags ----
    @Insert("INSERT INTO product_tag (product_id, tag_id) VALUES (#{productId}, #{tagId})")
    int insertTag(@Param("productId") Long productId, @Param("tagId") Long tagId);

    @Select("SELECT tag_id FROM product_tag WHERE product_id = #{productId}")
    List<Long> findTagIdsByProductId(@Param("productId") Long productId);

    @Delete("DELETE FROM product_tag WHERE product_id = #{productId}")
    int deleteTagsByProduct(@Param("productId") Long productId);

    @Select("SELECT supplier_id FROM product_supplier WHERE product_id = #{productId}")
    List<Long> findSupplierIdsByProductId(@Param("productId") Long productId);

    @Delete("DELETE FROM product_supplier WHERE product_id = #{productId}")
    int deleteSuppliersByProduct(@Param("productId") Long productId);

    @Insert("INSERT INTO product_supplier (product_id, supplier_id) VALUES (#{productId}, #{supplierId})")
    int insertSupplier(@Param("productId") Long productId, @Param("supplierId") Long supplierId);

    @Delete("DELETE FROM product_supplier WHERE supplier_id = #{supplierId} AND outlet_id IN (SELECT id FROM outlet WHERE vendor_id=#{vendorId} AND deleted_at IS NULL)")
    int clearSupplierAssignment(@Param("supplierId") Long supplierId, @Param("vendorId") Long vendorId);

    int assignSupplierProducts(@Param("supplierId") Long supplierId, @Param("ids") List<Long> ids,
                               @Param("vendorId") Long vendorId);

    @Select("SELECT id, code FROM product_barcode WHERE product_id = #{productId} ORDER BY id")
    List<ProductBarcode> findBarcodesByProductId(@Param("productId") Long productId);

    @Select("SELECT COALESCE(SUM(quantity), 0) FROM product_inventory WHERE product_id = #{productId}")
    BigDecimal sumInventoryByProductId(@Param("productId") Long productId);

    @Select("SELECT o.id AS outletId, o.name AS outletName, "
            + "COALESCE(pi.quantity, 0) AS quantity, "
            + "pi.reorder_level AS reorderLevel, "
            + "pi.reorder_amount AS reorderAmount, "
            + "pi.reorder_limit AS reorderLimit, "
            + "pi.max_quantity AS maxQuantity, "
            + "COALESCE(pi.on_order, 0) AS onOrder, "
            + "COALESCE(pi.reorder_rounding, 'NONE') AS reorderRounding "
            + "FROM outlet o "
            + "LEFT JOIN product_inventory pi ON pi.outlet_id = o.id AND pi.product_id = #{productId} "
            + "WHERE o.deleted_at IS NULL "
            + "ORDER BY o.name")
    List<ProductInventory> findInventoryByProductId(@Param("productId") Long productId);

    @Update("INSERT INTO product_inventory (product_id, outlet_id, quantity, reorder_level, reorder_amount, "
            + "reorder_limit, max_quantity, reorder_rounding) "
            + "VALUES (#{productId}, #{row.outletId}, #{row.quantity}, #{row.reorderLevel}, #{row.reorderAmount}, "
            + "#{row.reorderLimit}, #{row.maxQuantity}, #{row.reorderRounding}) "
            + "ON CONFLICT (product_id, outlet_id) DO UPDATE SET quantity = EXCLUDED.quantity, "
            + "reorder_level = EXCLUDED.reorder_level, reorder_amount = EXCLUDED.reorder_amount, "
            + "reorder_limit = EXCLUDED.reorder_limit, max_quantity = EXCLUDED.max_quantity, "
            + "reorder_rounding = EXCLUDED.reorder_rounding")
    int upsertInventory(@Param("productId") Long productId, @Param("row") ProductInventory row);

    /**
     * Active products whose name matches exactly. Used by sell quick keys so a
     * key cannot pick a newer partial match or a price other than the catalogue price.
     */
    @Select("SELECT p.id, p.name, p.case_quantity AS caseQuantity, "
            + "(SELECT pp.price FROM product_price pp "
            + "  WHERE pp.product_id = p.id ORDER BY pp.quantity LIMIT 1) AS price "
            + "FROM product p "
            + "WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE' "
            + "AND LOWER(p.name) = LOWER(#{name}) "
            + "LIMIT 2")
    List<Product> findActiveByExactName(@Param("name") String name);

    @Select("SELECT p.id, p.name, p.case_quantity AS caseQuantity, "
            + "(SELECT pp.price FROM product_price pp "
            + "  WHERE pp.product_id = p.id ORDER BY pp.quantity LIMIT 1) AS price "
            + "FROM product p "
            + "WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE' AND p.id = #{id}")
    Product findActiveForSell(@Param("id") Long id);

    @Select("SELECT id, product_id AS productId, quantity, price FROM product_price "
            + "WHERE product_id = #{productId} ORDER BY quantity")
    List<ProductPrice> findPricesByProductId(@Param("productId") Long productId);

    @Select("SELECT name FROM product WHERE family_id = #{familyId} AND id != #{productId} "
            + "AND deleted_at IS NULL ORDER BY name LIMIT 6")
    List<String> findFamilyMemberNames(@Param("familyId") Long familyId,
                                       @Param("productId") Long productId);

    @Update("UPDATE product_price SET quantity = #{quantity}, price = #{price} WHERE id = #{priceId}")
    int updatePriceRow(@Param("priceId") Long priceId,
                       @Param("quantity") BigDecimal quantity,
                       @Param("price") BigDecimal price);

    @Delete("DELETE FROM product_price WHERE id = #{priceId} AND product_id = #{productId}")
    int deletePriceById(@Param("productId") Long productId, @Param("priceId") Long priceId);

    @Delete("DELETE FROM product_price WHERE product_id = #{productId}")
    int deletePricesByProduct(@Param("productId") Long productId);

    @Select("SELECT id FROM product_price WHERE product_id = #{productId} ORDER BY quantity LIMIT 1")
    Long findDefaultPriceId(@Param("productId") Long productId);

    @Update("UPDATE product_price SET price = #{price} WHERE id = #{priceId}")
    int updatePriceById(@Param("priceId") Long priceId, @Param("price") BigDecimal price);

    @Insert("INSERT INTO product_price (product_id, quantity, price) VALUES (#{productId}, 1, #{price})")
    int insertDefaultPrice(@Param("productId") Long productId, @Param("price") BigDecimal price);

    // ---- prices ----
    @Insert("INSERT INTO product_price (product_id, quantity, price) VALUES (#{productId}, #{quantity}, #{price})")
    int insertPrice(@Param("productId") Long productId,
                      @Param("quantity") BigDecimal quantity,
                      @Param("price") BigDecimal price);

    @Update("UPDATE product SET brand_id = NULL WHERE brand_id = #{brandId}")
    int clearBrandAssignment(@Param("brandId") Long brandId);

    int assignBrandProducts(@Param("brandId") Long brandId, @Param("ids") List<Long> ids);

    @Update("UPDATE product SET category_id = NULL WHERE category_id = #{categoryId}")
    int clearCategoryAssignment(@Param("categoryId") Long categoryId);

    int assignCategoryProducts(@Param("categoryId") Long categoryId, @Param("ids") List<Long> ids);

    @Update("UPDATE product SET family_id = NULL WHERE family_id = #{familyId}")
    int clearFamilyAssignment(@Param("familyId") Long familyId);

    int assignFamilyProducts(@Param("familyId") Long familyId, @Param("ids") List<Long> ids);

    @Delete("DELETE FROM product_tag WHERE tag_id = #{tagId}")
    int clearTagAssignment(@Param("tagId") Long tagId);

    int assignTagProducts(@Param("tagId") Long tagId, @Param("ids") List<Long> ids);

    @Select("SELECT name FROM category WHERE id = #{id}")
    String findCategoryName(@Param("id") Long id);

    @Select("SELECT * FROM product WHERE deleted_at IS NULL "
            + "AND LOWER(TRIM(name)) = LOWER(TRIM(#{name})) LIMIT 1")
    Product findActiveByName(@Param("name") String name);

    @Select("""
        SELECT p.*
        FROM product p
        JOIN outlet o ON o.id=p.outlet_id AND o.vendor_id=#{vendorId} AND o.deleted_at IS NULL
        WHERE p.deleted_at IS NULL AND p.status='ACTIVE'
          AND LOWER(TRIM(p.name)) = LOWER(TRIM(#{name}))
        ORDER BY p.id
        LIMIT 2
        """)
    List<Product> findActiveByExactNameForVendor(@Param("name") String name,
                                                  @Param("vendorId") Long vendorId);

    @Select("SELECT COUNT(*) FROM product "
            + "WHERE LOWER(TRIM(name)) = LOWER(TRIM(#{name})) "
            + "AND deleted_at IS NULL")
    long countActiveByName(@Param("name") String name);

    @Select("SELECT COUNT(*) FROM product "
            + "WHERE LOWER(TRIM(name)) = LOWER(TRIM(#{name})) "
            + "AND deleted_at IS NULL AND id != #{excludeId}")
    long countActiveByNameExcluding(@Param("name") String name, @Param("excludeId") Long excludeId);

    /** Sell-pad folder browse — see ProductMapper.xml. */
    List<Product> browseForSell(@Param("stem") String stem, @Param("q") String q,
                                @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT p.id, p.name, p.case_quantity AS caseQuantity, "
            + "(SELECT pp.price FROM product_price pp WHERE pp.product_id=p.id AND pp.outlet_id=#{outletId} "
            + "AND pp.quantity <= #{quantity} ORDER BY pp.quantity DESC LIMIT 1) AS price "
            + "FROM product p JOIN outlet o ON o.id=p.outlet_id "
            + "WHERE p.id=#{id} AND p.status='ACTIVE' AND p.deleted_at IS NULL "
            + "AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND o.deleted_at IS NULL")
    Product findSellableForOutlet(@Param("id") Long id, @Param("vendorId") Long vendorId,
                                  @Param("outletId") Long outletId, @Param("quantity") BigDecimal quantity);

    @Select("SELECT p.id, p.name, p.case_quantity AS caseQuantity, "
            + "(SELECT pp.price FROM product_price pp WHERE pp.product_id=p.id AND pp.outlet_id=#{outletId} "
            + "ORDER BY pp.quantity LIMIT 1) AS price "
            + "FROM product p JOIN outlet o ON o.id=p.outlet_id "
            + "WHERE p.status='ACTIVE' AND p.deleted_at IS NULL AND o.vendor_id=#{vendorId} AND o.id=#{outletId} "
            + "AND LOWER(p.name)=LOWER(#{name}) ORDER BY p.id LIMIT 2")
    List<Product> findActiveByExactNameForOutlet(@Param("name") String name, @Param("vendorId") Long vendorId,
                                                  @Param("outletId") Long outletId);

    @Select("SELECT p.id, p.name, p.case_quantity AS caseQuantity, "
            + "(SELECT pp.price FROM product_price pp WHERE pp.product_id=p.id AND pp.outlet_id=#{outletId} "
            + "ORDER BY pp.quantity LIMIT 1) AS price "
            + "FROM product p JOIN outlet o ON o.id=p.outlet_id "
            + "WHERE p.id=#{id} AND p.status='ACTIVE' AND p.deleted_at IS NULL "
            + "AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND o.deleted_at IS NULL")
    Product findActiveForOutlet(@Param("id") Long id, @Param("vendorId") Long vendorId,
                                @Param("outletId") Long outletId);

    // ---- product filter facets (values actually used by products) ----

    @Select("""
            SELECT CAST(b.id AS CHAR) AS id, b.name AS name, COUNT(*) AS product_count
            FROM product p
            INNER JOIN brand b ON b.id = p.brand_id
            WHERE p.deleted_at IS NULL
            GROUP BY b.id, b.name
            ORDER BY b.name
            """)
    List<ProductFilterOption> listBrandFilterOptions();

    @Select("""
            SELECT CAST(c.id AS CHAR) AS id, c.name AS name, COUNT(*) AS product_count
            FROM product p
            INNER JOIN category c ON c.id = p.category_id
            WHERE p.deleted_at IS NULL
            GROUP BY c.id, c.name
            ORDER BY c.name
            """)
    List<ProductFilterOption> listCategoryFilterOptions();

    @Select("""
            SELECT CAST(f.id AS CHAR) AS id, f.name AS name, COUNT(*) AS product_count
            FROM product p
            INNER JOIN family f ON f.id = p.family_id
            WHERE p.deleted_at IS NULL
            GROUP BY f.id, f.name
            ORDER BY f.name
            """)
    List<ProductFilterOption> listFamilyFilterOptions();

    @Select("""
            SELECT CAST(t.id AS CHAR) AS id, t.name AS name, COUNT(DISTINCT p.id) AS product_count
            FROM product p
            INNER JOIN product_tag pt ON pt.product_id = p.id
            INNER JOIN tag t ON t.id = pt.tag_id
            WHERE p.deleted_at IS NULL
            GROUP BY t.id, t.name
            ORDER BY t.name
            """)
    List<ProductFilterOption> listTagFilterOptions();

    @Select("""
            SELECT CAST(s.id AS CHAR) AS id, s.name AS name, COUNT(DISTINCT p.id) AS product_count
            FROM product p
            INNER JOIN product_supplier ps ON ps.product_id = p.id
            INNER JOIN supplier s ON s.id = ps.supplier_id
            WHERE p.deleted_at IS NULL
            GROUP BY s.id, s.name
            ORDER BY s.name
            """)
    List<ProductFilterOption> listSupplierFilterOptions();

    @Select("""
            SELECT p.type AS id,
                   CASE p.type
                     WHEN 'STANDARD' THEN 'Standard'
                     WHEN 'VARIANT' THEN 'Variant'
                     WHEN 'COMPOSITE' THEN 'Composite'
                     ELSE p.type
                   END AS name,
                   COUNT(*) AS product_count
            FROM product p
            WHERE p.deleted_at IS NULL AND p.type IS NOT NULL AND p.type != ''
            GROUP BY p.type
            ORDER BY name
            """)
    List<ProductFilterOption> listTypeFilterOptions();

    @Select("""
            SELECT CAST(tr.id AS CHAR) AS id, tr.name AS name, COUNT(*) AS product_count
            FROM product p
            INNER JOIN tax_rate tr ON tr.id = p.tax_rate_id
            WHERE p.deleted_at IS NULL
            GROUP BY tr.id, tr.name
            ORDER BY tr.name
            """)
    List<ProductFilterOption> listTaxRateFilterOptions();

    @Select("""
            SELECT CAST(tr.id AS CHAR) AS id, tr.name AS name, COUNT(*) AS product_count
            FROM product p
            INNER JOIN tax_rate tr ON tr.id = p.cost_tax_rate_id
            WHERE p.deleted_at IS NULL
            GROUP BY tr.id, tr.name
            ORDER BY tr.name
            """)
    List<ProductFilterOption> listCostTaxRateFilterOptions();
}

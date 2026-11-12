package com.orithos.modules.classification.mapper;

import com.orithos.modules.classification.Classification;
import com.orithos.modules.classification.ClassificationType;
import com.orithos.modules.classification.MdbReference;
import lombok.Data;
import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Generic CRUD over the brand/category/family/tag tables. ${table} is enum-validated. */
@Mapper
public interface ClassificationMapper {

    default List<Classification> list(ClassificationType type, String name, Long outletId) {
        return switch (type) {
            case BRAND -> listBrand(name, outletId);
            case CATEGORY -> listCategory(name, outletId);
            case FAMILY -> listFamily(name, outletId);
            case TAG -> listTag(name, outletId);
        };
    }

    default Classification findVisible(ClassificationType type, Long id, Long outletId) {
        return switch (type) {
            case BRAND -> findVisibleBrand(id, outletId);
            case CATEGORY -> findVisibleCategory(id, outletId);
            case FAMILY -> findVisibleFamily(id, outletId);
            case TAG -> findVisibleTag(id, outletId);
        };
    }

    /**
     * Soft-deleted rows are normally hidden, but keep any that still have active product
     * links so product filters (and admin lists) stay consistent with names shown on products.
     * Rows owned by the outlet or linked to the outlet's products are visible — matching
     * {@code /api/products/filter-options}.
     */
    @Select("""
            <script>
            SELECT b.id, b.name, b.mdb_id, (
              SELECT COUNT(*) FROM product p
              WHERE p.brand_id = b.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
            ) AS product_count
            FROM brand b
            WHERE (
                b.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.brand_id = b.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL)
              )
              AND (b.deleted_at IS NULL OR EXISTS (
                SELECT 1 FROM product p
                WHERE p.brand_id = b.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
              <if test="name != null and name != ''">
                AND b.name ILIKE CONCAT('%', #{name}, '%')
              </if>
            ORDER BY b.name
            </script>
            """)
    List<Classification> listBrand(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("""
            <script>
            SELECT c.id, c.name, c.mdb_id, (
              SELECT COUNT(*) FROM product p
              WHERE p.category_id = c.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
            ) AS product_count
            FROM category c
            WHERE (
                c.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.category_id = c.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL)
              )
              AND (c.deleted_at IS NULL OR EXISTS (
                SELECT 1 FROM product p
                WHERE p.category_id = c.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
              <if test="name != null and name != ''">
                AND c.name ILIKE CONCAT('%', #{name}, '%')
              </if>
            ORDER BY c.name
            </script>
            """)
    List<Classification> listCategory(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("""
            <script>
            SELECT f.id, f.name, f.mdb_id, (
              SELECT COUNT(*) FROM product p
              WHERE p.family_id = f.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
            ) AS product_count
            FROM family f
            WHERE (
                f.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.family_id = f.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL)
              )
              AND (f.deleted_at IS NULL OR EXISTS (
                SELECT 1 FROM product p
                WHERE p.family_id = f.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
              <if test="name != null and name != ''">
                AND f.name ILIKE CONCAT('%', #{name}, '%')
              </if>
            ORDER BY f.name
            </script>
            """)
    List<Classification> listFamily(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("""
            <script>
            SELECT t.id, t.name, t.mdb_id, (
              SELECT COUNT(DISTINCT pt.product_id) FROM product_tag pt
              INNER JOIN product p ON p.id = pt.product_id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
              WHERE pt.tag_id = t.id
            ) AS product_count
            FROM tag t
            WHERE (
                t.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product_tag pt
                  INNER JOIN product p ON p.id = pt.product_id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
                  WHERE pt.tag_id = t.id)
              )
              AND (t.deleted_at IS NULL OR EXISTS (
                SELECT 1 FROM product_tag pt
                INNER JOIN product p ON p.id = pt.product_id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
                WHERE pt.tag_id = t.id))
              <if test="name != null and name != ''">
                AND t.name ILIKE CONCAT('%', #{name}, '%')
              </if>
            ORDER BY t.name
            </script>
            """)
    List<Classification> listTag(@Param("name") String name, @Param("outletId") Long outletId);

    @Select("""
            SELECT b.id, b.name, b.mdb_id FROM brand b
            WHERE b.id = #{id}
              AND (
                b.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.brand_id = b.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
            """)
    Classification findVisibleBrand(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("""
            SELECT c.id, c.name, c.mdb_id FROM category c
            WHERE c.id = #{id}
              AND (
                c.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.category_id = c.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
            """)
    Classification findVisibleCategory(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("""
            SELECT f.id, f.name, f.mdb_id FROM family f
            WHERE f.id = #{id}
              AND (
                f.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product p
                  WHERE p.family_id = f.id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL))
            """)
    Classification findVisibleFamily(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("""
            SELECT t.id, t.name, t.mdb_id FROM tag t
            WHERE t.id = #{id}
              AND (
                t.outlet_id = #{outletId}
                OR EXISTS (
                  SELECT 1 FROM product_tag pt
                  INNER JOIN product p ON p.id = pt.product_id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
                  WHERE pt.tag_id = t.id))
            """)
    Classification findVisibleTag(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT id, name, mdb_id FROM ${table} WHERE id = #{id} AND outlet_id = #{outletId}")
    Classification findById(@Param("table") String table, @Param("id") Long id,
                            @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "c.id")
    @Insert("INSERT INTO ${table} (name, mdb_id, outlet_id) VALUES (#{c.name}, #{c.mdbId}, #{outletId})")
    int insert(@Param("table") String table, @Param("c") Classification c,
               @Param("outletId") Long outletId);

    @Update("UPDATE ${table} SET name = #{c.name}, mdb_id = #{c.mdbId} WHERE id = #{c.id}")
    int updateById(@Param("table") String table, @Param("c") Classification c);

    @Update("UPDATE ${table} SET name = #{c.name}, mdb_id = #{c.mdbId} WHERE id = #{c.id} AND outlet_id = #{outletId}")
    int update(@Param("table") String table, @Param("c") Classification c,
               @Param("outletId") Long outletId);

    default int countProducts(ClassificationType type, Long id, Long outletId) {
        return switch (type) {
            case BRAND -> countBrandProducts(id, outletId);
            case CATEGORY -> countCategoryProducts(id, outletId);
            case FAMILY -> countFamilyProducts(id, outletId);
            case TAG -> countTagProducts(id, outletId);
        };
    }

    @Select("SELECT COUNT(*) FROM product WHERE brand_id = #{id} AND outlet_id = #{outletId} AND deleted_at IS NULL")
    int countBrandProducts(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM product WHERE category_id = #{id} AND outlet_id = #{outletId} AND deleted_at IS NULL")
    int countCategoryProducts(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM product WHERE family_id = #{id} AND outlet_id = #{outletId} AND deleted_at IS NULL")
    int countFamilyProducts(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("""
            SELECT COUNT(DISTINCT pt.product_id) FROM product_tag pt
            INNER JOIN product p ON p.id = pt.product_id AND p.outlet_id = #{outletId} AND p.deleted_at IS NULL
            WHERE pt.tag_id = #{id}
            """)
    int countTagProducts(@Param("id") Long id, @Param("outletId") Long outletId);

    @Update("UPDATE ${table} SET deleted_at = NOW() WHERE id = #{id}")
    int softDeleteById(@Param("table") String table, @Param("id") Long id);

    @Update("UPDATE ${table} SET deleted_at = NOW() WHERE id = #{id} AND outlet_id = #{outletId}")
    int softDelete(@Param("table") String table, @Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NULL AND outlet_id = #{outletId}")
    long count(@Param("table") String table, @Param("outletId") Long outletId);

    @Select("""
            SELECT COALESCE(mdb_id, id) AS id, name FROM ${table}
            WHERE deleted_at IS NULL AND outlet_id = #{outletId}
              AND COALESCE(mdb_id, id) <= 2147483647
            ORDER BY name
            """)
    List<MdbReference> listMdbReferences(@Param("table") String table, @Param("outletId") Long outletId);

    @Select("""
            <script>
            SELECT p.brand_id AS classification_id,
                   COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) AS day,
                   COALESCE(SUM(si.quantity), 0) AS quantity
            FROM sale_item si
            INNER JOIN sale s ON s.id = si.sale_id
            INNER JOIN product p ON p.id = si.product_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND s.outlet_id = #{outletId}
              AND p.outlet_id = #{outletId}
              AND p.brand_id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &gt;= CAST(#{from} AS date)
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &lt; CAST(#{to} AS date)
            GROUP BY p.brand_id, COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))
            </script>
            """)
    List<DailyQuantity> brandSalesByDay(@Param("ids") List<Long> ids, @Param("outletId") Long outletId,
                                        @Param("from") String from, @Param("to") String to);

    @Select("""
            <script>
            SELECT p.category_id AS classification_id,
                   COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) AS day,
                   COALESCE(SUM(si.quantity), 0) AS quantity
            FROM sale_item si
            INNER JOIN sale s ON s.id = si.sale_id
            INNER JOIN product p ON p.id = si.product_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND s.outlet_id = #{outletId}
              AND p.outlet_id = #{outletId}
              AND p.category_id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &gt;= CAST(#{from} AS date)
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &lt; CAST(#{to} AS date)
            GROUP BY p.category_id, COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))
            </script>
            """)
    List<DailyQuantity> categorySalesByDay(@Param("ids") List<Long> ids, @Param("outletId") Long outletId,
                                           @Param("from") String from, @Param("to") String to);

    @Select("""
            <script>
            SELECT p.family_id AS classification_id,
                   COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) AS day,
                   COALESCE(SUM(si.quantity), 0) AS quantity
            FROM sale_item si
            INNER JOIN sale s ON s.id = si.sale_id
            INNER JOIN product p ON p.id = si.product_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND s.outlet_id = #{outletId}
              AND p.outlet_id = #{outletId}
              AND p.family_id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &gt;= CAST(#{from} AS date)
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &lt; CAST(#{to} AS date)
            GROUP BY p.family_id, COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))
            </script>
            """)
    List<DailyQuantity> familySalesByDay(@Param("ids") List<Long> ids, @Param("outletId") Long outletId,
                                         @Param("from") String from, @Param("to") String to);

    @Select("""
            <script>
            SELECT pt.tag_id AS classification_id,
                   COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) AS day,
                   COALESCE(SUM(si.quantity), 0) AS quantity
            FROM sale_item si
            INNER JOIN sale s ON s.id = si.sale_id
            INNER JOIN product_tag pt ON pt.product_id = si.product_id
            INNER JOIN product p ON p.id = si.product_id
            WHERE s.status NOT IN ('VOIDED', 'PARKED')
              AND s.outlet_id = #{outletId}
              AND p.outlet_id = #{outletId}
              AND pt.tag_id IN
              <foreach collection="ids" item="id" open="(" separator="," close=")">#{id}</foreach>
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &gt;= CAST(#{from} AS date)
              AND COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at)) &lt; CAST(#{to} AS date)
            GROUP BY pt.tag_id, COALESCE(s.business_date, DATE(s.local_sold_at), DATE(s.created_at))
            </script>
            """)
    List<DailyQuantity> tagSalesByDay(@Param("ids") List<Long> ids, @Param("outletId") Long outletId,
                                      @Param("from") String from, @Param("to") String to);

    @Data
    class DailyQuantity {
        private Long classificationId;
        private LocalDate day;
        private BigDecimal quantity;
    }
}

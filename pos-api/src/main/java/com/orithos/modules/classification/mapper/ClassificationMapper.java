package com.orithos.modules.classification.mapper;

import com.orithos.modules.classification.Classification;
import com.orithos.modules.classification.ClassificationType;
import com.orithos.modules.classification.MdbReference;
import org.apache.ibatis.annotations.*;

import java.util.List;

/** Generic CRUD over the brand/category/family/tag tables. ${table} is enum-validated. */
@Mapper
public interface ClassificationMapper {

    default List<Classification> list(ClassificationType type, String name) {
        return switch (type) {
            case BRAND -> listBrand(name);
            case CATEGORY -> listCategory(name);
            case FAMILY -> listFamily(name);
            case TAG -> listTag(name);
        };
    }

    /**
     * Soft-deleted rows are normally hidden, but keep any that still have active product
     * links so product filters (and admin lists) stay consistent with names shown on products.
     */
    @Select("SELECT b.id, b.name, b.mdb_id, ("
            + "SELECT COUNT(*) FROM product p WHERE p.brand_id = b.id AND p.deleted_at IS NULL"
            + ") AS product_count FROM brand b WHERE "
            + "(b.deleted_at IS NULL OR EXISTS ("
            + "SELECT 1 FROM product p WHERE p.brand_id = b.id AND p.deleted_at IS NULL)) "
            + "AND (#{name} IS NULL OR b.name LIKE CONCAT('%', #{name}, '%')) ORDER BY b.id DESC")
    List<Classification> listBrand(@Param("name") String name);

    @Select("SELECT c.id, c.name, c.mdb_id, ("
            + "SELECT COUNT(*) FROM product p WHERE p.category_id = c.id AND p.deleted_at IS NULL"
            + ") AS product_count FROM category c WHERE "
            + "(c.deleted_at IS NULL OR EXISTS ("
            + "SELECT 1 FROM product p WHERE p.category_id = c.id AND p.deleted_at IS NULL)) "
            + "AND (#{name} IS NULL OR c.name LIKE CONCAT('%', #{name}, '%')) ORDER BY c.id DESC")
    List<Classification> listCategory(@Param("name") String name);

    @Select("SELECT f.id, f.name, f.mdb_id, ("
            + "SELECT COUNT(*) FROM product p WHERE p.family_id = f.id AND p.deleted_at IS NULL"
            + ") AS product_count FROM family f WHERE "
            + "(f.deleted_at IS NULL OR EXISTS ("
            + "SELECT 1 FROM product p WHERE p.family_id = f.id AND p.deleted_at IS NULL)) "
            + "AND (#{name} IS NULL OR f.name LIKE CONCAT('%', #{name}, '%')) ORDER BY f.id DESC")
    List<Classification> listFamily(@Param("name") String name);

    @Select("SELECT t.id, t.name, t.mdb_id, ("
            + "SELECT COUNT(DISTINCT pt.product_id) FROM product_tag pt "
            + "INNER JOIN product p ON p.id = pt.product_id AND p.deleted_at IS NULL "
            + "WHERE pt.tag_id = t.id"
            + ") AS product_count FROM tag t WHERE "
            + "(t.deleted_at IS NULL OR EXISTS ("
            + "SELECT 1 FROM product_tag pt "
            + "INNER JOIN product p ON p.id = pt.product_id AND p.deleted_at IS NULL "
            + "WHERE pt.tag_id = t.id)) "
            + "AND (#{name} IS NULL OR t.name LIKE CONCAT('%', #{name}, '%')) ORDER BY t.id DESC")
    List<Classification> listTag(@Param("name") String name);

    @Select("SELECT id, name, mdb_id FROM ${table} WHERE id = #{id}")
    Classification findById(@Param("table") String table, @Param("id") Long id);

    @Options(useGeneratedKeys = true, keyProperty = "c.id")
    @Insert("INSERT INTO ${table} (name, mdb_id) VALUES (#{c.name}, #{c.mdbId})")
    int insert(@Param("table") String table, @Param("c") Classification c);

    @Update("UPDATE ${table} SET name = #{c.name}, mdb_id = #{c.mdbId} WHERE id = #{c.id}")
    int update(@Param("table") String table, @Param("c") Classification c);

    default int countProducts(ClassificationType type, Long id) {
        return switch (type) {
            case BRAND -> countBrandProducts(id);
            case CATEGORY -> countCategoryProducts(id);
            case FAMILY -> countFamilyProducts(id);
            case TAG -> countTagProducts(id);
        };
    }

    @Select("SELECT COUNT(*) FROM product WHERE brand_id = #{id} AND deleted_at IS NULL")
    int countBrandProducts(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM product WHERE category_id = #{id} AND deleted_at IS NULL")
    int countCategoryProducts(@Param("id") Long id);

    @Select("SELECT COUNT(*) FROM product WHERE family_id = #{id} AND deleted_at IS NULL")
    int countFamilyProducts(@Param("id") Long id);

    @Select("SELECT COUNT(DISTINCT pt.product_id) FROM product_tag pt "
            + "INNER JOIN product p ON p.id = pt.product_id AND p.deleted_at IS NULL "
            + "WHERE pt.tag_id = #{id}")
    int countTagProducts(@Param("id") Long id);

    @Update("UPDATE ${table} SET deleted_at = NOW() WHERE id = #{id}")
    int softDelete(@Param("table") String table, @Param("id") Long id);

    @Select("SELECT COUNT(*) FROM ${table} WHERE deleted_at IS NULL")
    long count(@Param("table") String table);

    @Select("SELECT COALESCE(mdb_id, id) AS id, name FROM ${table} "
            + "WHERE deleted_at IS NULL AND COALESCE(mdb_id, id) <= 2147483647 "
            + "ORDER BY name")
    List<MdbReference> listMdbReferences(@Param("table") String table);
}

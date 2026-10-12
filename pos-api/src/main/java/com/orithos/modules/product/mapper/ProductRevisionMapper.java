package com.orithos.modules.product.mapper;

import com.orithos.modules.product.ProductRevision;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectKey;

import java.util.List;

@Mapper
public interface ProductRevisionMapper {

    @Select("""
        SELECT r.*, u.name AS user_name
        FROM product_revision r
        LEFT JOIN app_user u ON u.id = r.user_id
        WHERE r.product_id = #{productId}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT #{size} OFFSET #{offset}
        """)
    List<ProductRevision> page(@Param("productId") Long productId,
                               @Param("size") int size,
                               @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM product_revision WHERE product_id = #{productId}")
    long count(@Param("productId") Long productId);

    @SelectKey(
            statement = "SELECT COALESCE(MAX(id), 0) + 1 FROM product_revision",
            keyProperty = "id",
            before = true,
            resultType = Long.class)
    @Insert("""
        INSERT INTO product_revision (id, product_id, user_id, action, field_name, old_value, new_value, summary)
        VALUES (#{id}, #{productId}, #{userId}, #{action}, #{fieldName}, #{oldValue}, #{newValue}, #{summary})
        """)
    int insert(ProductRevision revision);
}

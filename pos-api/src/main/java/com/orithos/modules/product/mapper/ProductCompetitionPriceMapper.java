package com.orithos.modules.product.mapper;

import com.orithos.modules.product.ProductCompetitionPrice;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface ProductCompetitionPriceMapper {

    @Select("SELECT * FROM product_competition_price WHERE product_id = #{productId} ORDER BY created_at DESC")
    List<ProductCompetitionPrice> findByProduct(@Param("productId") Long productId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO product_competition_price (product_id, competitor, price, created_at) "
            + "VALUES (#{productId}, #{competitor}, #{price}, #{createdAt})")
    int insert(ProductCompetitionPrice p);

    @Delete("DELETE FROM product_competition_price WHERE id = #{id}")
    int deleteById(@Param("id") Long id);
}

package com.orithos.modules.bulkprice.mapper;

import com.orithos.modules.bulkprice.BulkPriceEditQuery;
import com.orithos.modules.bulkprice.BulkPriceEditRow;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.math.BigDecimal;
import java.util.List;

@Mapper
public interface BulkPriceEditMapper {
    List<BulkPriceEditRow> page(@Param("q") BulkPriceEditQuery q);
    long count(@Param("q") BulkPriceEditQuery q);
    List<PriceRow> listPrices(@Param("productIds") List<Long> productIds);

    @Select("SELECT id FROM product_price WHERE product_id = #{productId} AND quantity = #{quantity} LIMIT 1")
    Long findPriceId(@Param("productId") Long productId, @Param("quantity") BigDecimal quantity);

    @Update("UPDATE product_price SET price = #{price} WHERE id = #{priceId}")
    int updatePrice(@Param("priceId") Long priceId, @Param("price") BigDecimal price);

    @Insert("INSERT INTO product_price (product_id, quantity, price) VALUES (#{productId}, #{quantity}, #{price})")
    int insertPrice(@Param("productId") Long productId,
                    @Param("quantity") BigDecimal quantity,
                    @Param("price") BigDecimal price);

    class PriceRow {
        private Long priceId;
        private Long productId;
        private BigDecimal quantity;
        private BigDecimal price;

        public Long getPriceId() { return priceId; }
        public void setPriceId(Long priceId) { this.priceId = priceId; }
        public Long getProductId() { return productId; }
        public void setProductId(Long productId) { this.productId = productId; }
        public BigDecimal getQuantity() { return quantity; }
        public void setQuantity(BigDecimal quantity) { this.quantity = quantity; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
    }
}

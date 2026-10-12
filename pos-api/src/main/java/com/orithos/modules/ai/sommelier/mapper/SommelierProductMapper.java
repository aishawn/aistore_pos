package com.orithos.modules.ai.sommelier.mapper;

import lombok.Data;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;

@Mapper
public interface SommelierProductMapper {

    List<CatalogRow> listCatalog(@Param("outletId") Long outletId);

    List<CatalogRow> searchCatalog(@Param("outletId") Long outletId, @Param("q") String q);

    CatalogRow findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Insert("""
            INSERT INTO ai_sommelier_feedback
              (outlet_id, user_id, product_id, reaction, profile_json)
            VALUES (#{outletId}, #{userId}, #{productId}, #{reaction}, #{profileJson})
            """)
    int insertFeedback(@Param("outletId") Long outletId,
                       @Param("userId") Long userId,
                       @Param("productId") Long productId,
                       @Param("reaction") String reaction,
                       @Param("profileJson") String profileJson);

    @Data
    class CatalogRow {
        private Long id;
        private String name;
        private String description;
        private String image;
        private String categoryName;
        private String familyName;
        private String brandName;
        private BigDecimal price;
        private BigDecimal promoPrice;
        private BigDecimal stockQuantity;
        private Boolean trackInventory;
        private BigDecimal caseQuantity;
        private String storedWineType;
        private Double storedDryness;
        private Double storedBody;
        private Double storedFruitiness;
        private Double storedOak;
        private Double storedTannin;
        private String storedVarietal;
        private String storedRegion;
        private String storedVintage;
        private String storedAromaTags;
        private String storedPalateTags;
        private String storedFoodTags;
        private String storedFinishNote;
    }
}

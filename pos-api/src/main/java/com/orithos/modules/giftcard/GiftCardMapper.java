package com.orithos.modules.giftcard;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface GiftCardMapper {

    String FILTER_WHERE = ""
            + "(#{code} IS NULL OR #{code} = '' OR LOWER(code) LIKE CONCAT('%', LOWER(#{code}), '%')) "
            + "AND ("
            + "  #{redeemedExpiredOnly} IS NULL "
            + "  OR (#{redeemedExpiredOnly} = TRUE AND (status='REDEEMED' OR (expiry IS NOT NULL AND expiry < NOW()))) "
            + "  OR (#{redeemedExpiredOnly} = FALSE AND status<>'REDEEMED' AND (expiry IS NULL OR expiry >= NOW()))"
            + ") "
            + "AND (#{outletId} IS NULL OR outlet_id = #{outletId}) ";

    @Select("SELECT * FROM gift_card WHERE " + FILTER_WHERE + "ORDER BY id DESC LIMIT #{size} OFFSET #{offset}")
    List<GiftCard> page(@Param("code") String code,
                        @Param("redeemedExpiredOnly") Boolean redeemedExpiredOnly,
                        @Param("outletId") Long outletId,
                        @Param("size") int size,
                        @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM gift_card WHERE " + FILTER_WHERE)
    long count(@Param("code") String code,
               @Param("redeemedExpiredOnly") Boolean redeemedExpiredOnly,
               @Param("outletId") Long outletId);

    @Select("SELECT * FROM gift_card WHERE id = #{id}")
    GiftCard findById(Long id);

    @Select("SELECT * FROM gift_card WHERE code = #{code}")
    GiftCard findByCode(String code);

    @Select("SELECT * FROM gift_card WHERE " + FILTER_WHERE + "ORDER BY id DESC")
    List<GiftCard> listAll(@Param("code") String code,
                           @Param("redeemedExpiredOnly") Boolean redeemedExpiredOnly,
                           @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO gift_card (client_id, outlet_id, code, original_amount, current_amount, expiry, status) "
            + "VALUES (#{clientId}, #{outletId}, #{code}, #{originalAmount}, #{currentAmount}, #{expiry}, #{status})")
    int insert(GiftCard g);

    @Update("UPDATE gift_card SET current_amount=#{currentAmount}, expiry=#{expiry} WHERE id=#{id}")
    int update(GiftCard g);

    @Select("SELECT m.*, g.code AS gift_card_code FROM gift_card_movement m "
            + "LEFT JOIN gift_card g ON g.id = m.gift_card_id "
            + "ORDER BY m.timestamp DESC LIMIT #{size} OFFSET #{offset}")
    List<GiftCardMovement> pageMovements(@Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM gift_card_movement")
    long countMovements();

    @Insert("INSERT INTO gift_card_movement (gift_card_id, sale_id, register_id, amount, action, timestamp) "
            + "VALUES (#{giftCardId}, #{saleId}, #{registerId}, #{amount}, #{action}, #{timestamp})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertMovement(GiftCardMovement m);
}

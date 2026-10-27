package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface OutletMapper {

    @Select("SELECT * FROM outlet WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC")
    List<Outlet> findAll();

    @Select("SELECT * FROM outlet WHERE vendor_id = #{vendorId} AND deleted_at IS NULL ORDER BY id ASC")
    List<Outlet> findByVendorId(Long vendorId);

    @Select("SELECT * FROM outlet WHERE id = #{id}")
    Outlet findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO outlet (vendor_id, name, contact_id, logo, business_number, loyalty_enabled, "
            + "loyalty_name, loyalty_earn_rate, loyalty_redeem_rate, has_kitchen_screen, ticketing_price_set_id) "
            + "VALUES (#{vendorId}, #{name}, #{contactId}, #{logo}, #{businessNumber}, CASE WHEN #{loyaltyEnabled} THEN 1 ELSE 0 END, "
            + "#{loyaltyName}, #{loyaltyEarnRate}, #{loyaltyRedeemRate}, CASE WHEN #{hasKitchenScreen} THEN 1 ELSE 0 END, #{ticketingPriceSetId})")
    int insert(Outlet o);

    @Update("UPDATE outlet SET name=#{name}, contact_id=#{contactId}, logo=#{logo}, "
            + "business_number=#{businessNumber}, loyalty_enabled=#{loyaltyEnabled}, loyalty_name=#{loyaltyName}, "
            + "loyalty_earn_rate=#{loyaltyEarnRate}, loyalty_redeem_rate=#{loyaltyRedeemRate}, "
            + "has_kitchen_screen=#{hasKitchenScreen}, ticketing_price_set_id=#{ticketingPriceSetId} WHERE id=#{id}")
    int update(Outlet o);

    @Update("UPDATE outlet SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);
}

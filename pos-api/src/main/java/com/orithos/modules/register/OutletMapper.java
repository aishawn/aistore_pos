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

    @Select("SELECT * FROM outlet WHERE id = #{id} AND vendor_id = #{vendorId} AND deleted_at IS NULL")
    Outlet findByIdAndVendor(@Param("id") Long id, @Param("vendorId") Long vendorId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO outlet (vendor_id, name, contact_id, logo, business_number, loyalty_enabled, "
            + "loyalty_name, loyalty_earn_rate, loyalty_redeem_rate, has_kitchen_screen, ticketing_price_set_id) "
            + "VALUES (#{vendorId}, #{name}, #{contactId}, #{logo}, #{businessNumber}, CASE WHEN #{loyaltyEnabled} THEN 1 ELSE 0 END, "
            + "#{loyaltyName}, #{loyaltyEarnRate}, #{loyaltyRedeemRate}, CASE WHEN #{hasKitchenScreen} THEN 1 ELSE 0 END, #{ticketingPriceSetId})")
    int insert(Outlet o);

    @Update("UPDATE outlet SET name=#{outlet.name}, contact_id=#{outlet.contactId}, logo=#{outlet.logo}, "
            + "business_number=#{outlet.businessNumber}, loyalty_enabled=CASE WHEN #{outlet.loyaltyEnabled} THEN 1 ELSE 0 END, loyalty_name=#{outlet.loyaltyName}, "
            + "loyalty_earn_rate=#{outlet.loyaltyEarnRate}, loyalty_redeem_rate=#{outlet.loyaltyRedeemRate}, "
            + "has_kitchen_screen=CASE WHEN #{outlet.hasKitchenScreen} THEN 1 ELSE 0 END, ticketing_price_set_id=#{outlet.ticketingPriceSetId} "
            + "WHERE id=#{outlet.id} AND vendor_id=#{vendorId}")
    int update(@Param("outlet") Outlet outlet, @Param("vendorId") Long vendorId);

    @Update("UPDATE outlet SET deleted_at = NOW() WHERE id=#{id} AND vendor_id=#{vendorId}")
    int softDelete(@Param("id") Long id, @Param("vendorId") Long vendorId);
}

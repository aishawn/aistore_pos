package com.orithos.modules.buyingperiod;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface BuyingPeriodMapper {

    @Select("SELECT * FROM buying_period WHERE outlet_id = #{outletId} ORDER BY \"start\" DESC LIMIT #{size} OFFSET #{offset}")
    List<BuyingPeriod> pageByOutlet(@Param("outletId") Long outletId,
                                    @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM buying_period WHERE outlet_id = #{outletId}")
    long countByOutlet(@Param("outletId") Long outletId);

    @Select("SELECT * FROM buying_period WHERE id = #{id} AND outlet_id = #{outletId}")
    BuyingPeriod findByIdAndOutlet(@Param("id") Long id, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO buying_period (item_id, item_type, outlet_id, supplier_id, \"start\", \"end\", quantity, cost) "
            + "VALUES (#{itemId}, #{itemType}, #{outletId}, #{supplierId}, #{start}, #{end}, #{quantity}, #{cost})")
    int insert(BuyingPeriod b);

    @Update("UPDATE buying_period SET item_id=#{period.itemId}, item_type=#{period.itemType}, "
            + "supplier_id=#{period.supplierId}, \"start\"=#{period.start}, \"end\"=#{period.end}, "
            + "quantity=#{period.quantity}, cost=#{period.cost} "
            + "WHERE id=#{period.id} AND outlet_id=#{outletId}")
    int update(@Param("period") BuyingPeriod period, @Param("outletId") Long outletId);

    @Delete("DELETE FROM buying_period WHERE id = #{id} AND outlet_id = #{outletId}")
    int delete(@Param("id") Long id, @Param("outletId") Long outletId);
}

package com.orithos.modules.buyingperiod;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface BuyingPeriodMapper {

    @Select("SELECT * FROM buying_period ORDER BY \"start\" DESC")
    List<BuyingPeriod> findAll();

    @Select("SELECT * FROM buying_period ORDER BY \"start\" DESC LIMIT #{size} OFFSET #{offset}")
    List<BuyingPeriod> page(@Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM buying_period")
    long count();

    @Select("SELECT * FROM buying_period WHERE id = #{id}")
    BuyingPeriod findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO buying_period (item_id, item_type, outlet_id, supplier_id, \"start\", \"end\", quantity, cost) "
            + "VALUES (#{itemId}, #{itemType}, #{outletId}, #{supplierId}, #{start}, #{end}, #{quantity}, #{cost})")
    int insert(BuyingPeriod b);

    @Update("UPDATE buying_period SET item_id=#{itemId}, item_type=#{itemType}, outlet_id=#{outletId}, "
            + "supplier_id=#{supplierId}, \"start\"=#{start}, \"end\"=#{end}, quantity=#{quantity}, cost=#{cost} WHERE id=#{id}")
    int update(BuyingPeriod b);

    @Delete("DELETE FROM buying_period WHERE id = #{id}")
    int delete(Long id);
}

package com.orithos.modules.salekeys;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SaleKeysMapper {

    @Select("SELECT * FROM sale_keys WHERE outlet_id = #{outletId} ORDER BY created_at DESC, id DESC")
    List<SaleKeys> findAllByOutlet(@Param("outletId") Long outletId);

    @Select("SELECT * FROM sale_keys WHERE id = #{id} AND outlet_id = #{outletId}")
    SaleKeys findByIdAndOutlet(@Param("id") Long id, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO sale_keys (outlet_id, name, sale_keys) VALUES (#{outletId}, #{name}, #{saleKeys})")
    int insert(SaleKeys s);

    @Update("UPDATE sale_keys SET name=#{name}, sale_keys=#{saleKeys} WHERE id=#{id} AND outlet_id=#{outletId}")
    int updateByIdAndOutlet(@Param("id") Long id, @Param("outletId") Long outletId, @Param("name") String name,
                            @Param("saleKeys") String saleKeys);

    @Delete("DELETE FROM sale_keys WHERE id = #{id} AND outlet_id = #{outletId}")
    int deleteByIdAndOutlet(@Param("id") Long id, @Param("outletId") Long outletId);
}

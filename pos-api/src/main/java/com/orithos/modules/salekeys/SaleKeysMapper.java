package com.orithos.modules.salekeys;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface SaleKeysMapper {

    @Select("SELECT * FROM sale_keys ORDER BY created_at DESC, id DESC")
    List<SaleKeys> findAll();

    @Select("SELECT * FROM sale_keys WHERE id = #{id}")
    SaleKeys findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO sale_keys (name, sale_keys) VALUES (#{name}, #{saleKeys})")
    int insert(SaleKeys s);

    @Update("UPDATE sale_keys SET name=#{name}, sale_keys=#{saleKeys} WHERE id=#{id}")
    int update(SaleKeys s);

    @Delete("DELETE FROM sale_keys WHERE id = #{id}")
    int delete(Long id);
}

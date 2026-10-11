package com.orithos.modules.config;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface BarcodeTemplateMapper {

    @Select("SELECT * FROM barcode_template ORDER BY id DESC")
    List<BarcodeTemplate> findAll();

    @Select("SELECT * FROM barcode_template WHERE id = #{id}")
    BarcodeTemplate findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO barcode_template (name, template, recalculate_quantity) "
            + "VALUES (#{name}, #{template}, #{recalculateQuantity})")
    int insert(BarcodeTemplate b);

    @Update("UPDATE barcode_template SET name=#{name}, template=#{template}, "
            + "recalculate_quantity=#{recalculateQuantity} WHERE id=#{id}")
    int update(BarcodeTemplate b);

    @Delete("DELETE FROM barcode_template WHERE id=#{id}")
    int delete(Long id);
}

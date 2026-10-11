package com.orithos.modules.customerdisplay;

import org.apache.ibatis.annotations.*;

import java.util.List;

@Mapper
public interface CustomerDisplayMapper {

    @Select("SELECT * FROM customer_display ORDER BY created_at DESC, id DESC")
    List<CustomerDisplay> findAll();

    @Select("SELECT * FROM customer_display WHERE id = #{id}")
    CustomerDisplay findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO customer_display (name, main_colour, text_colour, idle, sale) "
            + "VALUES (#{name}, #{mainColour}, #{textColour}, #{idle}, #{sale})")
    int insert(CustomerDisplay c);

    @Update("UPDATE customer_display SET name=#{name}, main_colour=#{mainColour}, "
            + "text_colour=#{textColour}, idle=#{idle}, sale=#{sale} WHERE id=#{id}")
    int update(CustomerDisplay c);

    @Delete("DELETE FROM customer_display WHERE id = #{id}")
    int delete(Long id);
}

package com.orithos.modules.config;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ReceiptMapper {

    @Select("<script>SELECT * FROM receipt"
            + "<if test='type != null'> WHERE type = #{type}</if>"
            + " ORDER BY id DESC</script>")
    List<Receipt> findAll(@Param("type") String type);

    @Select("SELECT * FROM receipt WHERE id = #{id}")
    Receipt findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO receipt (name, type, components, receipt_width, account_receipt) "
            + "VALUES (#{name}, #{type}, #{components}, #{receiptWidth}, #{accountReceipt})")
    int insert(Receipt r);

    @Update("UPDATE receipt SET name=#{name}, type=#{type}, components=#{components}, "
            + "receipt_width=#{receiptWidth}, account_receipt=#{accountReceipt} WHERE id=#{id}")
    int update(Receipt r);

    @Delete("DELETE FROM receipt WHERE id=#{id}")
    int delete(Long id);
}

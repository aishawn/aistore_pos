package com.orithos.modules.ticket;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface ShelfTicketMapper {

    @Select("SELECT * FROM shelf_ticket ORDER BY created_at DESC")
    List<ShelfTicket> findAll();

    @Select("SELECT * FROM shelf_ticket WHERE id = #{id}")
    ShelfTicket findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO shelf_ticket (product_id, outlet_id, user_id) "
            + "VALUES (#{productId}, #{outletId}, #{userId})")
    int insert(ShelfTicket t);

    @Delete("DELETE FROM shelf_ticket WHERE id = #{id}")
    int delete(Long id);
}

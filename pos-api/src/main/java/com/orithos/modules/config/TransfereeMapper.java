package com.orithos.modules.config;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface TransfereeMapper {

    @Select("SELECT * FROM transferee WHERE deleted_at IS NULL ORDER BY id DESC")
    List<Transferee> findAll();

    @Select("SELECT * FROM transferee WHERE id = #{id}")
    Transferee findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO transferee (name, contact_id, order_automatic_email, email_format, send_orders_to_accounts_flow) "
            + "VALUES (#{name}, #{contactId}, #{orderAutomaticEmail}, #{emailFormat}, #{sendOrdersToAccountsFlow})")
    int insert(Transferee t);

    @Update("UPDATE transferee SET name=#{name}, contact_id=#{contactId}, order_automatic_email=#{orderAutomaticEmail}, "
            + "email_format=#{emailFormat}, send_orders_to_accounts_flow=#{sendOrdersToAccountsFlow} WHERE id=#{id}")
    int update(Transferee t);

    @Update("UPDATE transferee SET deleted_at = NOW() WHERE id=#{id}")
    int softDelete(Long id);
}

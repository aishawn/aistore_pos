package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.CustomerRevision;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectKey;

import java.util.List;

@Mapper
public interface CustomerRevisionMapper {

    @Select("""
        SELECT r.*, u.name AS user_name
        FROM customer_revision r
        LEFT JOIN app_user u ON u.id = r.user_id
        WHERE r.customer_id = #{customerId}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT #{size} OFFSET #{offset}
        """)
    List<CustomerRevision> page(@Param("customerId") Long customerId,
                                @Param("size") int size,
                                @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM customer_revision WHERE customer_id = #{customerId}")
    long count(@Param("customerId") Long customerId);

    @SelectKey(
            statement = "SELECT COALESCE(MAX(id), 0) + 1 FROM customer_revision",
            keyProperty = "id",
            before = true,
            resultType = Long.class)
    @Insert("""
        INSERT INTO customer_revision (id, customer_id, user_id, action, field_name, old_value, new_value, summary)
        VALUES (#{id}, #{customerId}, #{userId}, #{action}, #{fieldName}, #{oldValue}, #{newValue}, #{summary})
        """)
    int insert(CustomerRevision revision);
}

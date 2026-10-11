package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.CustomerGroupRevision;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.SelectKey;

import java.util.List;

@Mapper
public interface CustomerGroupRevisionMapper {

    @Select("""
        SELECT r.*, u.name AS user_name
        FROM customer_group_revision r
        LEFT JOIN app_user u ON u.id = r.user_id
        WHERE r.customer_group_id = #{customerGroupId}
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT #{size} OFFSET #{offset}
        """)
    List<CustomerGroupRevision> page(@Param("customerGroupId") Long customerGroupId,
                                     @Param("size") int size,
                                     @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM customer_group_revision WHERE customer_group_id = #{customerGroupId}")
    long count(@Param("customerGroupId") Long customerGroupId);

    @SelectKey(
            statement = "SELECT COALESCE(MAX(id), 0) + 1 FROM customer_group_revision",
            keyProperty = "id",
            before = true,
            resultType = Long.class)
    @Insert("""
        INSERT INTO customer_group_revision (id, customer_group_id, user_id, action, field_name, old_value, new_value, summary)
        VALUES (#{id}, #{customerGroupId}, #{userId}, #{action}, #{fieldName}, #{oldValue}, #{newValue}, #{summary})
        """)
    int insert(CustomerGroupRevision revision);
}

package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface RegisterClosureMapper {

    @Select("SELECT * FROM register_closure "
            + "WHERE (#{registerId} IS NULL OR register_id = #{registerId}) "
            + "ORDER BY closed_at DESC LIMIT #{size} OFFSET #{offset}")
    List<RegisterClosure> page(@Param("registerId") Long registerId,
                               @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM register_closure "
            + "WHERE (#{registerId} IS NULL OR register_id = #{registerId})")
    long count(@Param("registerId") Long registerId);

    @Select("SELECT * FROM register_closure WHERE id = #{id}")
    RegisterClosure findById(Long id);

    @Select("SELECT * FROM register_closure_payment WHERE closure_id = #{closureId}")
    List<RegisterClosurePayment> findPaymentsByClosureId(Long closureId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register_closure (register_id, user_id, movement, total_expected, "
            + "total_received, total_transactions, total_surcharge, opened_at, closed_at) "
            + "VALUES (#{registerId}, #{userId}, #{movement}, #{totalExpected}, "
            + "#{totalReceived}, #{totalTransactions}, #{totalSurcharge}, #{openedAt}, #{closedAt})")
    int insert(RegisterClosure c);

    @Update("UPDATE register_closure SET note=#{note} WHERE id=#{id}")
    int updateNote(@Param("id") Long id, @Param("note") String note);
}

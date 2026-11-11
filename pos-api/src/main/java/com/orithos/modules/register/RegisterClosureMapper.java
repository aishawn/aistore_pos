package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface RegisterClosureMapper {

    @Select("SELECT * FROM register_closure "
            + "WHERE outlet_id = #{outletId} "
            + "AND (#{registerId,jdbcType=BIGINT} IS NULL OR register_id = #{registerId,jdbcType=BIGINT}) "
            + "ORDER BY closed_at DESC LIMIT #{size} OFFSET #{offset}")
    List<RegisterClosure> page(@Param("outletId") Long outletId,
                               @Param("registerId") Long registerId,
                               @Param("size") int size, @Param("offset") int offset);

    @Select("SELECT COUNT(*) FROM register_closure "
            + "WHERE outlet_id = #{outletId} "
            + "AND (#{registerId,jdbcType=BIGINT} IS NULL OR register_id = #{registerId,jdbcType=BIGINT})")
    long count(@Param("outletId") Long outletId, @Param("registerId") Long registerId);

    @Select("SELECT * FROM register_closure WHERE id = #{id} AND outlet_id = #{outletId}")
    RegisterClosure findById(@Param("id") Long id, @Param("outletId") Long outletId);

    @Select("SELECT * FROM register_closure WHERE id = #{id}")
    RegisterClosure findByIdUnscoped(Long id);

    @Select("SELECT * FROM register_closure_payment WHERE closure_id = #{closureId}")
    List<RegisterClosurePayment> findPaymentsByClosureId(Long closureId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register_closure (register_id, outlet_id, user_id, movement, total_expected, "
            + "total_received, total_transactions, total_surcharge, opened_at, closed_at) "
            + "VALUES (#{registerId}, #{outletId}, #{userId}, #{movement}, #{totalExpected}, "
            + "#{totalReceived}, #{totalTransactions}, #{totalSurcharge}, #{openedAt}, #{closedAt})")
    int insert(RegisterClosure c);

    @Insert("INSERT INTO register_closure_payment (closure_id, payment_method_id, expected, received, outlet_id) VALUES (#{closureId}, #{paymentMethodId}, #{expected}, #{received}, #{outletId})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertPayment(RegisterClosurePayment payment);

    @Update("UPDATE register_closure SET note=#{note} WHERE id=#{id} AND outlet_id=#{outletId}")
    int updateNote(@Param("id") Long id, @Param("outletId") Long outletId, @Param("note") String note);
}

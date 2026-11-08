package com.orithos.modules.register;

import org.apache.ibatis.annotations.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface RegisterSessionMapper {
    @Select("SELECT r.* FROM register r JOIN outlet o ON o.id=r.outlet_id WHERE o.vendor_id=#{vendorId} AND o.id=#{outletId} AND r.deleted_at IS NULL ORDER BY r.id")
    List<Register> listRegisters(@Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT r.* FROM register r JOIN outlet o ON o.id=r.outlet_id WHERE r.id=#{registerId} AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND r.deleted_at IS NULL FOR UPDATE")
    Register lockRegister(@Param("registerId") Long registerId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT r.* FROM register r JOIN outlet o ON o.id=r.outlet_id WHERE r.id=#{registerId} AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND r.deleted_at IS NULL")
    Register findRegister(@Param("registerId") Long registerId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT * FROM register_session WHERE register_id=#{registerId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId} AND closed_at IS NULL FOR UPDATE")
    RegisterSession lockActiveSession(@Param("registerId") Long registerId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT rs.* FROM register_session rs JOIN register r ON r.id=rs.register_id JOIN outlet o ON o.id=r.outlet_id "
            + "WHERE r.id=#{registerId} AND o.vendor_id=#{vendorId} AND o.id=#{outletId} AND rs.closed_at IS NULL")
    RegisterSession findActiveSession(@Param("registerId") Long registerId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT * FROM register_session WHERE register_id=#{registerId} AND open_idempotency_key=#{key}")
    RegisterSession findOpenReplay(@Param("registerId") Long registerId, @Param("key") String key);

    @Select("SELECT * FROM register_session WHERE id=#{sessionId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId}")
    RegisterSession findSession(@Param("sessionId") Long sessionId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Select("SELECT * FROM register_session WHERE id=#{sessionId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId} FOR UPDATE")
    RegisterSession lockSession(@Param("sessionId") Long sessionId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register_session (vendor_id,outlet_id,register_id,opened_by,opened_at,opening_float,open_idempotency_key) VALUES (#{vendorId},#{outletId},#{registerId},#{openedBy},#{openedAt},#{openingFloat},#{openIdempotencyKey})")
    int insertSession(RegisterSession session);

    @Update("UPDATE register_session SET closed_at=#{closedAt},closure_id=#{closureId},close_idempotency_key=#{closeIdempotencyKey},close_request_hash=#{closeRequestHash} WHERE id=#{id} AND closed_at IS NULL")
    int closeSession(RegisterSession session);

    @Update("UPDATE register SET closed=CASE WHEN #{closed} THEN 1 ELSE 0 END,open_time=#{openTime} WHERE id=#{registerId} AND outlet_id=#{outletId}")
    int updateRegisterState(@Param("registerId") Long registerId, @Param("outletId") Long outletId, @Param("closed") boolean closed, @Param("openTime") LocalDateTime openTime);

    @Select("SELECT * FROM register_cash_movement WHERE session_id=#{sessionId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId} AND idempotency_key=#{key}")
    RegisterCashMovement findMovementReplay(@Param("sessionId") Long sessionId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId, @Param("key") String key);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO register_cash_movement (session_id,vendor_id,outlet_id,register_id,user_id,movement_type,amount,reason,idempotency_key) VALUES (#{sessionId},#{vendorId},#{outletId},#{registerId},#{userId},#{movementType},#{amount},#{reason},#{idempotencyKey})")
    int insertMovement(RegisterCashMovement movement);

    @Select("SELECT COALESCE(SUM(CASE WHEN movement_type='CASH_IN' THEN amount ELSE -amount END),0) "
            + "FROM register_cash_movement WHERE session_id=#{sessionId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId}")
    BigDecimal sumCashMovements(@Param("sessionId") Long sessionId, @Param("vendorId") Long vendorId,
                                @Param("outletId") Long outletId);

    @Select("SELECT pm.id AS payment_method_id, pm.name AS payment_method_name, pm.type AS payment_method_type, "
            + "COALESCE(SUM(sp.amount + CASE WHEN pm.type='CASH' THEN COALESCE(sp.rounding,0) "
            + "ELSE COALESCE(sp.cashout,0) END),0) AS amount FROM register_payment_method rpm "
            + "JOIN payment_method pm ON pm.id=rpm.payment_method_id AND pm.outlet_id=rpm.outlet_id "
            + "LEFT JOIN sale_payment sp ON sp.payment_method_id=pm.id AND sp.register_id=rpm.register_id "
            + "AND sp.outlet_id=rpm.outlet_id AND sp.process_time >= #{openedAt} AND sp.process_time <= #{closedAt} "
            + "AND sp.status='COMPLETED' WHERE rpm.register_id=#{registerId} AND rpm.outlet_id=#{outletId} "
            + "GROUP BY pm.id,pm.name,pm.type ORDER BY pm.id")
    List<RegisterTenderLine> tenderTotals(@Param("registerId") Long registerId, @Param("outletId") Long outletId, @Param("openedAt") LocalDateTime openedAt, @Param("closedAt") LocalDateTime closedAt);

    @Select("SELECT COALESCE(SUM(CASE WHEN pm.type='CASH' THEN sp.amount + COALESCE(sp.rounding,0) ELSE 0 END),0) "
            + "- COALESCE(SUM(CASE WHEN pm.type<>'CASH' THEN COALESCE(sp.cashout,0) ELSE 0 END),0) "
            + "FROM sale_payment sp JOIN payment_method pm ON pm.id=sp.payment_method_id "
            + "WHERE sp.register_id=#{registerId} AND sp.outlet_id=#{outletId} AND sp.process_time >= #{openedAt} "
            + "AND sp.process_time <= #{closedAt} AND sp.status='COMPLETED'")
    BigDecimal cashSalesNetOfChange(@Param("registerId") Long registerId, @Param("outletId") Long outletId,
                                    @Param("openedAt") LocalDateTime openedAt, @Param("closedAt") LocalDateTime closedAt);

    @Select("SELECT COUNT(*) FROM sale_payment sp LEFT JOIN payment_method pm ON pm.id=sp.payment_method_id "
            + "WHERE sp.register_id=#{registerId} AND sp.outlet_id=#{outletId} AND sp.process_time >= #{openedAt} "
            + "AND sp.process_time <= #{closedAt} AND sp.status='COMPLETED' AND pm.id IS NULL")
    int countUnmappedPayments(@Param("registerId") Long registerId, @Param("outletId") Long outletId,
                              @Param("openedAt") LocalDateTime openedAt, @Param("closedAt") LocalDateTime closedAt);

    @Select("SELECT COUNT(DISTINCT s.id) FROM sale s WHERE s.register_id=#{registerId} AND s.outlet_id=#{outletId} AND s.created_at >= #{openedAt} AND s.created_at <= #{closedAt} AND s.status IN ('COMPLETED','PENDING')")
    int countSessionSales(@Param("registerId") Long registerId, @Param("outletId") Long outletId, @Param("openedAt") LocalDateTime openedAt, @Param("closedAt") LocalDateTime closedAt);

    @Select("SELECT COUNT(*) FROM sale WHERE register_id=#{registerId} AND outlet_id=#{outletId} "
            + "AND created_at >= #{openedAt} AND created_at <= #{closedAt} AND status='PENDING' AND outstanding > 0")
    int countUnsettledSales(@Param("registerId") Long registerId, @Param("outletId") Long outletId,
                            @Param("openedAt") LocalDateTime openedAt, @Param("closedAt") LocalDateTime closedAt);

    @Select("SELECT * FROM register_session WHERE register_id=#{registerId} AND vendor_id=#{vendorId} AND outlet_id=#{outletId} AND close_idempotency_key=#{key}")
    RegisterSession findCloseReplay(@Param("registerId") Long registerId, @Param("vendorId") Long vendorId, @Param("outletId") Long outletId, @Param("key") String key);
}

package com.orithos.modules.vendor;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface VendorMapper {

    @Select("SELECT * FROM vendor WHERE id = #{id}")
    Vendor findById(Long id);

    @Select("SELECT * FROM vendor WHERE subdomain = #{subdomain} LIMIT 1")
    Vendor findBySubdomain(String subdomain);

    @Select("SELECT COUNT(*) FROM vendor WHERE subdomain = #{subdomain}")
    long countBySubdomain(String subdomain);

    @Select("""
            SELECT * FROM vendor
            WHERE (CAST(#{q} AS TEXT) IS NULL OR CAST(#{q} AS TEXT) = ''
                   OR subdomain LIKE ('%' || #{q} || '%')
                   OR name LIKE ('%' || #{q} || '%')
            OR COALESCE(contact_name, '') LIKE ('%' || #{q} || '%'))
              AND (CAST(#{status} AS TEXT) IS NULL OR CAST(#{status} AS TEXT) = '' OR status = #{status})
            ORDER BY created_at DESC, id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<Vendor> page(@Param("q") String q,
                      @Param("status") String status,
                      @Param("size") int size,
                      @Param("offset") int offset);

    @Select("""
            SELECT COUNT(*) FROM vendor
            WHERE (CAST(#{q} AS TEXT) IS NULL OR CAST(#{q} AS TEXT) = ''
                   OR subdomain LIKE ('%' || #{q} || '%')
                   OR name LIKE ('%' || #{q} || '%')
            OR COALESCE(contact_name, '') LIKE ('%' || #{q} || '%'))
              AND (CAST(#{status} AS TEXT) IS NULL OR CAST(#{status} AS TEXT) = '' OR status = #{status})
            """)
    long countFiltered(@Param("q") String q, @Param("status") String status);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO vendor (name, subdomain, status, url, contact_name, trial_ends_at, outlet_id, dummy_data_requested)
            VALUES (#{name}, #{subdomain}, #{status}, #{url}, #{contactName}, #{trialEndsAt}, #{outletId},
                    CASE WHEN #{dummyDataRequested} THEN 1 ELSE 0 END)
            """)
    int insert(Vendor vendor);

    @Update("UPDATE vendor SET outlet_id=#{outletId}, default_tax_rate_id=#{defaultTaxRateId}, url=#{url} WHERE id=#{id}")
    int updateProvisioning(Vendor vendor);

    @Update("UPDATE vendor SET status=#{status} WHERE id=#{id}")
    int updateStatus(@org.apache.ibatis.annotations.Param("id") Long id,
                     @org.apache.ibatis.annotations.Param("status") String status);

    @Update("UPDATE vendor SET status=#{nextStatus} WHERE id=#{id} AND status=#{currentStatus}")
    int updateStatusIfCurrent(@Param("id") Long id,
                              @Param("nextStatus") String nextStatus,
                              @Param("currentStatus") String currentStatus);

    @Update("UPDATE vendor SET status='deleted' WHERE id=#{id} AND status='trial'")
    int markTrialDeleted(@Param("id") Long id);

    @Update("UPDATE vendor SET trial_ends_at=#{trialEndsAt}, status=#{status} WHERE id=#{id}")
    int updateTrialEndsAt(@Param("id") Long id,
                          @Param("trialEndsAt") java.time.LocalDateTime trialEndsAt,
                          @Param("status") String status);

    @Update("UPDATE vendor SET trial_ends_at=#{trialEndsAt}, status=#{nextStatus} WHERE id=#{id} AND status=#{currentStatus}")
    int updateTrialEndsAtIfCurrent(@Param("id") Long id,
                                   @Param("trialEndsAt") java.time.LocalDateTime trialEndsAt,
                                   @Param("nextStatus") String nextStatus,
                                   @Param("currentStatus") String currentStatus);

    @Update("""
            UPDATE vendor SET
              odoo_company_id=#{odooCompanyId},
              odoo_pos_config_id=#{odooPosConfigId},
              odoo_warehouse_id=#{odooWarehouseId},
              odoo_stock_location_id=#{odooStockLocationId},
              odoo_provision_status=#{odooProvisionStatus},
              odoo_provision_error=#{odooProvisionError},
              r2_prefix=#{r2Prefix}
            WHERE id=#{id}
            """)
    int updateOdooBinding(Vendor vendor);

    @Update("""
            UPDATE vendor SET
              dummy_data_requested=CASE WHEN #{dummyDataRequested} THEN 1 ELSE 0 END,
              sample_data_cleared_at=#{sampleDataClearedAt}
            WHERE id=#{id}
            """)
    int updateSampleDataFlags(Vendor vendor);
}

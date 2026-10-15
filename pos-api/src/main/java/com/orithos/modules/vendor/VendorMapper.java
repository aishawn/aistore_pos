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
            WHERE (#{q} IS NULL OR #{q} = ''
                   OR subdomain LIKE CONCAT('%', #{q}, '%')
                   OR name LIKE CONCAT('%', #{q}, '%')
                   OR IFNULL(contact_name, '') LIKE CONCAT('%', #{q}, '%'))
              AND (#{status} IS NULL OR #{status} = '' OR status = #{status})
            ORDER BY created_at DESC, id DESC
            LIMIT #{size} OFFSET #{offset}
            """)
    List<Vendor> page(@Param("q") String q,
                      @Param("status") String status,
                      @Param("size") int size,
                      @Param("offset") int offset);

    @Select("""
            SELECT COUNT(*) FROM vendor
            WHERE (#{q} IS NULL OR #{q} = ''
                   OR subdomain LIKE CONCAT('%', #{q}, '%')
                   OR name LIKE CONCAT('%', #{q}, '%')
                   OR IFNULL(contact_name, '') LIKE CONCAT('%', #{q}, '%'))
              AND (#{status} IS NULL OR #{status} = '' OR status = #{status})
            """)
    long countFiltered(@Param("q") String q, @Param("status") String status);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
            INSERT INTO vendor (name, subdomain, status, url, contact_name, trial_ends_at, outlet_id)
            VALUES (#{name}, #{subdomain}, #{status}, #{url}, #{contactName}, #{trialEndsAt}, #{outletId})
            """)
    int insert(Vendor vendor);

    @Update("UPDATE vendor SET outlet_id=#{outletId}, default_tax_rate_id=#{defaultTaxRateId}, url=#{url} WHERE id=#{id}")
    int updateProvisioning(Vendor vendor);

    @Update("UPDATE vendor SET status=#{status} WHERE id=#{id}")
    int updateStatus(@org.apache.ibatis.annotations.Param("id") Long id,
                     @org.apache.ibatis.annotations.Param("status") String status);
}

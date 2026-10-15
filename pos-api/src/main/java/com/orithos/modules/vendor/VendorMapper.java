package com.orithos.modules.vendor;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

@Mapper
public interface VendorMapper {

    @Select("SELECT * FROM vendor WHERE id = #{id}")
    Vendor findById(Long id);

    @Select("SELECT * FROM vendor WHERE subdomain = #{subdomain} LIMIT 1")
    Vendor findBySubdomain(String subdomain);

    @Select("SELECT COUNT(*) FROM vendor WHERE subdomain = #{subdomain}")
    long countBySubdomain(String subdomain);

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

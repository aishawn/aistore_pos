package com.orithos.modules.customer.mapper;

import com.orithos.modules.customer.Contact;
import org.apache.ibatis.annotations.*;

@Mapper
public interface ContactMapper {

    @Select("SELECT * FROM contact WHERE id = #{id}")
    Contact findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO contact (address_street1, address_street2, address_suburb, address_city,
                             address_postcode, address_region, address_country, email, fax, phone,
                             mobile, website, twitter, facebook)
        VALUES (#{addressStreet1}, #{addressStreet2}, #{addressSuburb}, #{addressCity},
                #{addressPostcode}, #{addressRegion}, #{addressCountry}, #{email}, #{fax}, #{phone},
                #{mobile}, #{website}, #{twitter}, #{facebook})
        """)
    int insert(Contact contact);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("""
        INSERT INTO contact (outlet_id, address_street1, address_street2, address_suburb, address_city,
                             address_postcode, address_region, address_country, email, fax, phone,
                             mobile, website, twitter, facebook)
        VALUES (#{outletId}, #{addressStreet1}, #{addressStreet2}, #{addressSuburb}, #{addressCity},
                #{addressPostcode}, #{addressRegion}, #{addressCountry}, #{email}, #{fax}, #{phone},
                #{mobile}, #{website}, #{twitter}, #{facebook})
        """)
    int insertForOutlet(Contact contact);

    @Update("""
        UPDATE contact SET address_street1=#{addressStreet1}, address_street2=#{addressStreet2},
               address_suburb=#{addressSuburb}, address_city=#{addressCity}, address_postcode=#{addressPostcode},
               address_region=#{addressRegion}, address_country=#{addressCountry}, email=#{email}, fax=#{fax},
               phone=#{phone}, mobile=#{mobile}, website=#{website}, twitter=#{twitter}, facebook=#{facebook}
        WHERE id=#{id}
        """)
    int update(Contact contact);

    @Update("""
        UPDATE contact SET address_street1=#{addressStreet1}, address_street2=#{addressStreet2},
               address_suburb=#{addressSuburb}, address_city=#{addressCity}, address_postcode=#{addressPostcode},
               address_region=#{addressRegion}, address_country=#{addressCountry}, email=#{email}, fax=#{fax},
               phone=#{phone}, mobile=#{mobile}, website=#{website}, twitter=#{twitter}, facebook=#{facebook}
        WHERE id=#{id} AND outlet_id=#{outletId}
        """)
    int updateForOutlet(Contact contact);
}

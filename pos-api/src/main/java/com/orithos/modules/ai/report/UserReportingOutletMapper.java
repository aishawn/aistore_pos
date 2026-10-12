package com.orithos.modules.ai.report;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface UserReportingOutletMapper {

    @Select("SELECT outlet_id FROM user_reporting_outlet WHERE user_id = #{userId}")
    List<Long> findOutletIds(Long userId);
}

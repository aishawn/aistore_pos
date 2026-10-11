package com.orithos;

import org.apache.ibatis.annotations.Mapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@MapperScan(basePackages = "com.orithos", annotationClass = Mapper.class)
public class OrithosApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrithosApplication.class, args);
    }
}


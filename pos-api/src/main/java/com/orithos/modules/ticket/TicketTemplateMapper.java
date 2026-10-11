package com.orithos.modules.ticket;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface TicketTemplateMapper {

    @Select("SELECT * FROM ticket_template ORDER BY created_at DESC, id DESC")
    List<TicketTemplate> findAll();

    @Select("SELECT * FROM ticket_template WHERE id = #{id}")
    TicketTemplate findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ticket_template (name, styles, transformation_script, width, height, fonts, fields_tracked, options) "
            + "VALUES (#{name}, #{styles}, #{transformationScript}, #{width}, #{height}, #{fonts}, #{fieldsTracked}, #{options})")
    int insert(TicketTemplate t);

    @Update("UPDATE ticket_template SET name=#{name}, styles=#{styles}, transformation_script=#{transformationScript}, "
            + "width=#{width}, height=#{height}, fonts=#{fonts}, fields_tracked=#{fieldsTracked}, options=#{options} WHERE id=#{id}")
    int update(TicketTemplate t);

    @Delete("DELETE FROM ticket_template WHERE id = #{id}")
    int delete(Long id);
}

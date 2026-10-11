package com.orithos.modules.ticket;

import org.apache.ibatis.annotations.*;
import java.util.List;

@Mapper
public interface TicketTemplatePageMapper {

    @Select("SELECT * FROM ticket_template_page WHERE (#{ticketTemplateId} IS NULL OR ticket_template_id = #{ticketTemplateId}) ORDER BY id DESC")
    List<TicketTemplatePage> findAll(@Param("ticketTemplateId") Long ticketTemplateId);

    @Select("SELECT * FROM ticket_template_page WHERE id = #{id}")
    TicketTemplatePage findById(Long id);

    @Options(useGeneratedKeys = true, keyProperty = "id")
    @Insert("INSERT INTO ticket_template_page (ticket_template_id, name, horizontal_panels, vertical_panels, page_width, page_height, page_margin, horizontal_panel_spacing, vertical_panel_spacing, cutting_width) "
            + "VALUES (#{ticketTemplateId}, #{name}, #{horizontalPanels}, #{verticalPanels}, #{pageWidth}, #{pageHeight}, #{pageMargin}, #{horizontalPanelSpacing}, #{verticalPanelSpacing}, #{cuttingWidth})")
    int insert(TicketTemplatePage p);

    @Update("UPDATE ticket_template_page SET name=#{name}, horizontal_panels=#{horizontalPanels}, vertical_panels=#{verticalPanels}, "
            + "page_width=#{pageWidth}, page_height=#{pageHeight}, page_margin=#{pageMargin}, "
            + "horizontal_panel_spacing=#{horizontalPanelSpacing}, vertical_panel_spacing=#{verticalPanelSpacing}, "
            + "cutting_width=#{cuttingWidth} WHERE id=#{id}")
    int update(TicketTemplatePage p);

    @Delete("DELETE FROM ticket_template_page WHERE id = #{id}")
    int delete(Long id);
}

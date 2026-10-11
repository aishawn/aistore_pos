package com.orithos.modules.ticket;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class TicketTemplatePage {
    private Long id;
    private Long ticketTemplateId;
    private String name;
    private Integer horizontalPanels;
    private Integer verticalPanels;
    private BigDecimal pageWidth;
    private BigDecimal pageHeight;
    private String pageMargin;
    private BigDecimal horizontalPanelSpacing;
    private BigDecimal verticalPanelSpacing;
    private BigDecimal cuttingWidth;
}

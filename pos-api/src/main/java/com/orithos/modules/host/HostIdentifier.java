package com.orithos.modules.host;

import lombok.Data;

@Data
public class HostIdentifier {
    private Long id;
    private Long hostConnectionId;
    private Long localId;
    private Long hostId;
    private String type;
}

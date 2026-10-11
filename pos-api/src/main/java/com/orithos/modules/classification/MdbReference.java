package com.orithos.modules.classification;

import lombok.Data;

/** Master Database entry for classification linking. */
@Data
public class MdbReference {
    /** MDB link id (COALESCE(mdb_id, id)); fits in INT for storage on new rows. */
    private Long id;
    private String name;
}

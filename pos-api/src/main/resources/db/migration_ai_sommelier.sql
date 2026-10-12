CREATE TABLE IF NOT EXISTS product_wine_profile (
  product_id   BIGINT       NOT NULL,
  wine_type    VARCHAR(32)  NOT NULL,
  dryness      DECIMAL(6,4) NULL,
  body         DECIMAL(6,4) NULL,
  fruitiness   DECIMAL(6,4) NULL,
  oak          DECIMAL(6,4) NULL,
  tannin       DECIMAL(6,4) NULL,
  varietal     VARCHAR(128) NULL,
  region       VARCHAR(128) NULL,
  vintage      VARCHAR(16)  NULL,
  aroma_tags   JSON         NULL,
  palate_tags  JSON         NULL,
  food_tags    JSON         NULL,
  finish_note  VARCHAR(255) NULL,
  source       VARCHAR(32)  NOT NULL DEFAULT 'inferred',
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  outlet_id    BIGINT       NOT NULL DEFAULT 1,
  PRIMARY KEY (product_id),
  KEY idx_wine_profile_outlet (outlet_id),
  KEY idx_wine_profile_type (wine_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_sommelier_feedback (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  outlet_id    BIGINT       NULL,
  user_id      BIGINT       NULL,
  product_id   BIGINT       NOT NULL,
  reaction     VARCHAR(32)  NOT NULL,
  profile_json JSON         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sommelier_feedback_outlet (outlet_id),
  KEY idx_sommelier_feedback_product (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

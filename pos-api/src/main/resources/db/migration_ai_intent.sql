-- Phase A: DB-backed AI intents, slots, prompts (add/remove without code change)
-- Run once against orithos MySQL.

CREATE TABLE IF NOT EXISTS ai_intent (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL COMMENT '意图编码，唯一白名单键',
  name         VARCHAR(128) NOT NULL COMMENT '显示名称',
  description  VARCHAR(512) NULL COMMENT '说明',
  prompt_hint  VARCHAR(1024) NULL COMMENT '写入分类 Prompt 的边界说明',
  default_panel VARCHAR(32) NULL COMMENT '默认 UI 面板: search|dialogue',
  default_view  VARCHAR(32) NULL COMMENT '默认收银左栏视图',
  enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_intent_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_slot (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL COMMENT '槽位编码: query|route|view|panel|action|ai_trigger',
  name         VARCHAR(128) NOT NULL,
  description  VARCHAR(512) NULL,
  value_type   VARCHAR(32)  NOT NULL DEFAULT 'string' COMMENT 'string|enum|keyword',
  max_length   INT          NOT NULL DEFAULT 100,
  enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_slot_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_slot_value (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  slot_code    VARCHAR(64)  NOT NULL COMMENT '对应 ai_slot.code',
  value_key    VARCHAR(128) NOT NULL COMMENT '模型可输出的键或别名',
  value        VARCHAR(512) NOT NULL COMMENT '实际生效值（路径/视图名/动作名）',
  label        VARCHAR(128) NULL,
  enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_slot_value (slot_code, value_key),
  KEY idx_ai_slot_value_slot (slot_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_prompt (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL COMMENT 'classify_system|respond_system',
  name         VARCHAR(128) NOT NULL,
  content      TEXT         NOT NULL,
  enabled      TINYINT(1)   NOT NULL DEFAULT 1,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ai_prompt_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

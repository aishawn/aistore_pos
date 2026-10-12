-- Add Sell UI AI-trigger keywords (safe to re-run).
-- Existing installs: run after migration_ai_intent.sql / seed_ai_intent.sql.

SET NAMES utf8mb4;

INSERT IGNORE INTO `ai_slot`
  (`code`, `name`, `description`, `value_type`, `max_length`, `enabled`, `sort_order`)
VALUES
('ai_trigger', 'AI trigger keyword',
 'Sell search-mode phrases that route to AI (UI only, not LLM slots)',
 'keyword', 64, 1, 60);

INSERT IGNORE INTO `ai_slot_value`
  (`slot_code`, `value_key`, `value`, `label`, `enabled`, `sort_order`)
VALUES
('ai_trigger', 'find',      'find',     'find',     1, 10),
('ai_trigger', 'search',    'search',   'search',   1, 20),
('ai_trigger', 'open',      'open',     'open',     1, 30),
('ai_trigger', 'show',      'show',     'show',     1, 40),
('ai_trigger', 'go_to',     'go to',    'go to',    1, 50),
('ai_trigger', 'help',      'help',     'help',     1, 60),
('ai_trigger', 'how_to',    'how to',   'how to',   1, 70),
('ai_trigger', 'what',      'what',     'what',     1, 80),
('ai_trigger', 'where',     'where',    'where',    1, 90),
('ai_trigger', 'zhao',      '找',       '找',       1, 100),
('ai_trigger', 'sou_yixia', '搜一下',   '搜一下',   1, 110),
('ai_trigger', 'dakai',     '打开',     '打开',     1, 120),
('ai_trigger', 'bangwo',    '帮我',     '帮我',     1, 130),
('ai_trigger', 'zenme',     '怎么',     '怎么',     1, 140),
('ai_trigger', 'chaxun',    '查询',     '查询',     1, 150),
('ai_trigger', 'qu_dingdan','去订单',   '去订单',   1, 160),
('ai_trigger', 'jiezhang',  '结账',     '结账',     1, 170),
('ai_trigger', 'daohang',   '导航',     '导航',     1, 180);

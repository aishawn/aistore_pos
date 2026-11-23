UPDATE settings s
SET value = 'true'
WHERE s.name = 'company.sell.allow_cash_out_without_sale'
  AND LOWER(TRIM(COALESCE(s.value, ''))) IN ('false', '0', 'no')
  AND NOT EXISTS (
    SELECT 1
    FROM settings o
    WHERE o.name = 'meta.owned.company.sell.allow_cash_out_without_sale'
      AND o.scope_type = s.scope_type
      AND (o.scope_id IS NOT DISTINCT FROM s.scope_id)
  );
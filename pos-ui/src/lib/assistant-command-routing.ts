const explicitWriteLanguage = /(?:把|将|改成|设置为|提高|降低|上调|下调|修改|更新|rename|change|update|raise|increase|lower|decrease|客户.*(?:电话|邮箱)|customer.*(?:phone|email))/i;
const quantifiedReplenishmentWrite = /\b(?:replenish|restock)\s+(?:the\s+)?[\p{L}\p{N}-]+\s+(?:to|by|with)\s+\d+|(?:把|将)?[^，。！？\n]{1,24}补货(?:到|至)\s*\d+/iu;

export function looksLikeAssistantWriteCommand(text: string): boolean {
  return explicitWriteLanguage.test(text) || quantifiedReplenishmentWrite.test(text);
}

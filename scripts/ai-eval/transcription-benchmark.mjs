const enCases = [
  ["product", "How many VB cans do we have?", { productIdentifiers: ["VB cans"] }],
  ["product", "Check the stock for Carlton Draught.", { productIdentifiers: ["Carlton Draught"] }],
  ["product", "Do we still have Yellow Tail Shiraz?", { productIdentifiers: ["Yellow Tail Shiraz"] }],
  ["product", "How much Great Northern Super Crisp is left?", { productIdentifiers: ["Great Northern Super Crisp"] }],
  ["product", "Find stock for Bundaberg Ginger Beer.", { productIdentifiers: ["Bundaberg Ginger Beer"] }],
  ["barcode", "Check barcode nine three one two three four five six seven eight nine zero one.", { barcodes: ["9312345678901"] }],
  ["barcode", "Look up barcode nine three two zero zero zero one zero zero zero one two three.", { barcodes: ["9320001000123"] }],
  ["barcode", "Find product barcode nine three one one one one two two two two three three four.", { barcodes: ["9311112222334"] }],
  ["barcode", "Search barcode nine three zero zero one two three four five six seven eight nine zero.", { barcodes: ["93001234567890"] }],
  ["barcode", "What is in stock under barcode nine three one two two two three three three four four four five?", { barcodes: ["9312223334445"] }],
  ["numbers", "How many bottles did we sell yesterday, twenty-seven or more?", { numbers: ["twenty-seven"] }],
  ["numbers", "We sold one hundred and sixteen cans today.", { numbers: ["one hundred and sixteen"] }],
  ["numbers", "Show sales for register number four.", { numbers: ["four"] }],
  ["numbers", "Did we sell thirty-two bottles this morning?", { numbers: ["thirty-two"] }],
  ["numbers", "How many transactions were there, sixty or sixty-one?", { numbers: ["sixty", "sixty-one"] }],
  ["dates", "What were sales on the seventeenth of June?", { dates: ["seventeenth of June"] }],
  ["dates", "Show stock as of the third of August twenty twenty-six.", { dates: ["third of August twenty twenty-six"] }],
  ["dates", "Compare sales from Monday the eighth to Friday the twelfth of September.", { dates: ["Monday the eighth", "Friday the twelfth of September"] }],
  ["dates", "How much did we sell last Sunday?", { dates: ["last Sunday"] }],
  ["dates", "Show the previous complete week, Monday to Sunday.", { dates: ["previous complete week", "Monday to Sunday"] }],
  ["inventory", "How much stock do we have in the shop right now?", {}],
  ["inventory", "Which products are out of stock today?", {}],
  ["inventory", "Show me low stock items, but do not change anything.", {}],
  ["inventory", "Is there any Carlton Draught left on the shelf?", { productIdentifiers: ["Carlton Draught"] }],
  ["inventory", "Tell me the current quantity for SKU VB twelve pack.", { productIdentifiers: ["VB twelve pack"] }],
  ["sales", "How much money did we take today?", {}],
  ["sales", "How many bottles did we sell yesterday?", {}],
  ["sales", "What was the average sale value last week?", { dates: ["last week"] }],
  ["sales", "Show revenue, units sold, and transaction count for Friday.", { dates: ["Friday"] }],
  ["sales", "Compare this month with the same period last month.", { dates: ["this month", "last month"] }],
  ["negation", "We did not sell any VB cans yesterday, correct?", { productIdentifiers: ["VB cans"], dates: ["yesterday"] }],
  ["negation", "Do not place an order; just tell me the stock quantity.", {}],
  ["negation", "Nothing should be changed. How much did we sell?", {}],
  ["negation", "I am not asking you to adjust stock, only read the current balance.", {}],
  ["negation", "There were no sales for this product on Tuesday, is that right?", { dates: ["Tuesday"] }],
  ["noise", "How many Carlton Draught do we have right now?", { productIdentifiers: ["Carlton Draught"] }],
  ["noise", "Show total sales for yesterday and the day before.", { dates: ["yesterday", "the day before"] }],
  ["noise", "Look up SKU VB twelve pack and tell me the available quantity.", { productIdentifiers: ["VB twelve pack"] }],
  ["noise", "Did we sell more than forty bottles on Saturday?", { numbers: ["forty"], dates: ["Saturday"] }],
  ["noise", "Check barcode nine three one two three four five six seven eight nine zero one.", { barcodes: ["9312345678901"] }],
  ["pause", "How much   stock do we have   for VB cans?", { productIdentifiers: ["VB cans"] }],
  ["pause", "Show sales   for yesterday   by transaction count.", { dates: ["yesterday"] }],
  ["pause", "Compare this week   with last week.", { dates: ["this week", "last week"] }],
  ["pause", "What is the quantity   of Carlton Draught   right now?", { productIdentifiers: ["Carlton Draught"] }],
  ["pause", "Were there   any refunds   on Monday?", { dates: ["Monday"] }],
  ["code-switch", "How many VB cans do we have, 昨天卖了几瓶?", { productIdentifiers: ["VB cans"], dates: ["昨天"] }],
  ["code-switch", "Show me Carlton Draught 库存还有多少?", { productIdentifiers: ["Carlton Draught"] }],
  ["code-switch", "Yesterday sales, 昨天营业额是多少?", { dates: ["yesterday"] }],
  ["code-switch", "Check barcode nine three one two three four five six seven eight nine zero one, 查一下库存。", { barcodes: ["9312345678901"] }],
  ["code-switch", "Do not change anything, 只查一下今天卖了多少。", { dates: ["今天"] }],
];

const zhCases = [
  ["product", "VB罐装啤酒现在还有多少？", { productIdentifiers: ["VB罐装啤酒"] }],
  ["product", "查一下Carlton Draught还有没有库存。", { productIdentifiers: ["Carlton Draught"] }],
  ["product", "Yellow Tail Shiraz现在有几瓶？", { productIdentifiers: ["Yellow Tail Shiraz"] }],
  ["product", "Great Northern Super Crisp还剩多少？", { productIdentifiers: ["Great Northern Super Crisp"] }],
  ["product", "帮我查Bundaberg Ginger Beer的库存。", { productIdentifiers: ["Bundaberg Ginger Beer"] }],
  ["barcode", "查条码九三一二三四五六七八九零一。", { barcodes: ["9312345678901"] }],
  ["barcode", "商品条码九三二零零零一零零零一二三还有多少库存？", { barcodes: ["9320001000123"] }],
  ["barcode", "帮我找一下条码九三一一一一二二二二三三四对应的商品。", { barcodes: ["9311112222334"] }],
  ["barcode", "查询条码九三零零一二三四五六七八九零。", { barcodes: ["93001234567890"] }],
  ["barcode", "条码九三一二二二三三三四四四五的商品还有货吗？", { barcodes: ["9312223334445"] }],
  ["numbers", "昨天卖了二十七瓶，对吗？", { numbers: ["二十七"] }],
  ["numbers", "今天一共卖出一百一十六罐。", { numbers: ["一百一十六"] }],
  ["numbers", "四号收银台今天有多少笔交易？", { numbers: ["四号"] }],
  ["numbers", "今天上午卖了三十二瓶吗？", { numbers: ["三十二"] }],
  ["numbers", "交易笔数是六十笔还是六十一笔？", { numbers: ["六十笔", "六十一笔"] }],
  ["dates", "六月十七日的销售额是多少？", { dates: ["六月十七日"] }],
  ["dates", "查一下二零二六年八月三日的库存。", { dates: ["二零二六年八月三日"] }],
  ["dates", "比较九月八日到九月十二日的销售情况。", { dates: ["九月八日", "九月十二日"] }],
  ["dates", "上个星期天卖了多少钱？", { dates: ["上个星期天"] }],
  ["dates", "查上一个完整周，从周一到周日。", { dates: ["上一个完整周", "周一到周日"] }],
  ["inventory", "现在店里还有多少库存？", {}],
  ["inventory", "今天哪些商品已经缺货？", {}],
  ["inventory", "列出低库存商品，不要修改任何数据。", {}],
  ["inventory", "货架上还有Carlton Draught吗？", { productIdentifiers: ["Carlton Draught"] }],
  ["inventory", "查一下SKU VB十二罐装的现有数量。", { productIdentifiers: ["VB十二罐装"] }],
  ["sales", "今天一共收了多少钱？", {}],
  ["sales", "昨天卖出了多少瓶？", {}],
  ["sales", "上周的平均客单价是多少？", { dates: ["上周"] }],
  ["sales", "查星期五的销售额、售出数量和交易笔数。", { dates: ["星期五"] }],
  ["sales", "比较本月和上个月同期的销售额。", { dates: ["本月", "上个月同期"] }],
  ["negation", "昨天没有卖出VB罐装啤酒，对吗？", { productIdentifiers: ["VB罐装啤酒"], dates: ["昨天"] }],
  ["negation", "不要下采购单，只告诉我现在有多少库存。", {}],
  ["negation", "任何数据都不要改，只查一下销售额。", {}],
  ["negation", "我不是要调整库存，只需要读取当前数量。", {}],
  ["negation", "星期二这个商品没有销售记录，是这样吗？", { dates: ["星期二"] }],
  ["noise", "Carlton Draught现在还有几瓶？", { productIdentifiers: ["Carlton Draught"] }],
  ["noise", "查昨天和前天的销售总额。", { dates: ["昨天", "前天"] }],
  ["noise", "SKU VB十二罐装的可用库存是多少？", { productIdentifiers: ["VB十二罐装"] }],
  ["noise", "星期六卖了超过四十瓶吗？", { numbers: ["四十"], dates: ["星期六"] }],
  ["noise", "查一下条码九三一二三四五六七八九零一的库存。", { barcodes: ["9312345678901"] }],
  ["pause", "现在   VB罐装啤酒   还有多少库存？", { productIdentifiers: ["VB罐装啤酒"] }],
  ["pause", "查一下   昨天的销售   交易笔数。", { dates: ["昨天"] }],
  ["pause", "比较本周   和上周的销售额。", { dates: ["本周", "上周"] }],
  ["pause", "Carlton Draught   当前库存   有多少？", { productIdentifiers: ["Carlton Draught"] }],
  ["pause", "星期一   有退款记录   吗？", { dates: ["星期一"] }],
  ["code-switch", "VB cans现在有多少，昨天卖了几瓶？", { productIdentifiers: ["VB cans"], dates: ["昨天"] }],
  ["code-switch", "Carlton Draught库存还有多少？", { productIdentifiers: ["Carlton Draught"] }],
  ["code-switch", "Yesterday sales，昨天营业额是多少？", { dates: ["昨天"] }],
  ["code-switch", "查条码九三一二三四五六七八九零一，check the stock。", { barcodes: ["9312345678901"] }],
  ["code-switch", "不要修改任何东西，只查today卖了多少。", { dates: ["today"] }],
];

export const transcriptionBenchmarkCases = [
  ...enCases.map(([category, utterance, criticalEntities], index) => ({
    id: `en-${String(index + 1).padStart(2, "0")}`,
    lang: "en-AU",
    voiceLocale: "en-AU",
    category,
    utterance,
    expectedText: utterance.replace(/\s{2,}/g, " "),
    criticalEntities,
  })),
  ...zhCases.map(([category, utterance, criticalEntities], index) => ({
    id: `zh-${String(index + 1).padStart(2, "0")}`,
    lang: "zh-CN",
    voiceLocale: "zh-CN",
    category,
    utterance,
    expectedText: utterance.replace(/\s{2,}/g, " "),
    criticalEntities,
  })),
];

export const transcriptionThresholds = { "en-AU": 0.15, "zh-CN": 0.2, criticalEntityAccuracy: 0.95 };

function tokens(text, lang) {
  const normalized = String(text ?? "").normalize("NFKC").toLocaleLowerCase(lang);
  const clean = normalized.replace(/[\p{P}\p{S}]+/gu, " ").trim();
  if (lang === "zh-CN" && Intl.Segmenter) {
    return [...new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(clean)]
      .filter((part) => part.isWordLike)
      .map((part) => part.segment);
  }
  return clean ? clean.split(/\s+/u) : [];
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[right.length];
}

function normalizeEntity(value, lang) {
  return String(value).normalize("NFKC").toLocaleLowerCase(lang).replace(/[\p{P}\p{S}\s]+/gu, "");
}

const englishNumberWords = new Map([
  ...["zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen"].flatMap((group) => group.split(" ").map((word, index) => [word, index])),
  ...["twenty thirty forty fifty sixty seventy eighty ninety"].flatMap((group) => group.split(" ").map((word, index) => [word, (index + 2) * 10])),
]);

function parseEnglishNumber(text) {
  const words = String(text).toLocaleLowerCase("en-AU").match(/[a-z]+/g) ?? [];
  if (!words.length || words.some((word) => word !== "and" && word !== "a" && !englishNumberWords.has(word) && !["hundred", "thousand"].includes(word))) return null;
  let total = 0;
  let group = 0;
  for (const word of words) {
    if (word === "and" || word === "a") continue;
    if (word === "hundred") group = Math.max(group, 1) * 100;
    else if (word === "thousand") { total += Math.max(group, 1) * 1000; group = 0; }
    else group += englishNumberWords.get(word);
  }
  return total + group;
}

function parseChineseNumber(text) {
  const source = String(text).replace(/[零〇一二兩两三四五六七八九十百千萬万]/g, "");
  const digits = [...String(text).matchAll(/[零〇一二兩两三四五六七八九]/g)].map(([digit]) => ({ 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[digit]);
  if (!source && digits.length) {
    if (/^[零〇一二兩两三四五六七八九]+$/.test(text)) return Number(digits.join(""));
    let total = 0;
    let section = 0;
    let number = 0;
    for (const char of text) {
      const digit = ({ 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 })[char];
      if (digit !== undefined) number = digit;
      else if (char === "十") { section += (number || 1) * 10; number = 0; }
      else if (char === "百") { section += (number || 1) * 100; number = 0; }
      else if (char === "千") { section += (number || 1) * 1000; number = 0; }
      else if (char === "万" || char === "萬") { total += (section + number) * 10000; section = 0; number = 0; }
    }
    return total + section + number;
  }
  return null;
}

function numericCandidates(text) {
  const source = String(text).normalize("NFKC");
  const candidates = new Set([...source.matchAll(/\d+/g)].map(([number]) => String(Number(number))));
  for (const match of source.matchAll(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)(?:[ -]+(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and))*/gi)) {
    const number = parseEnglishNumber(match[0]);
    if (number !== null) candidates.add(String(number));
  }
  for (const match of source.matchAll(/[零〇一二兩两三四五六七八九十百千萬万]+/g)) {
    const number = parseChineseNumber(match[0]);
    if (number !== null) candidates.add(String(number));
  }
  return candidates;
}

const monthNumbers = new Map("january february march april may june july august september october november december".split(" ").map((month, index) => [month, index + 1]));
const ordinalNumbers = new Map("first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth".split(" ").map((word, index) => [word, index + 1]));
for (let day = 21; day <= 31; day++) {
  const tens = day < 30 ? "twenty" : "thirty";
  const unit = day % 10;
  const unitWord = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth"][unit];
  ordinalNumbers.set(day === 30 ? "thirtieth" : day === 31 ? "thirty first" : `${tens} ${unitWord}`, day);
}

function dateKeys(text, lang) {
  const source = String(text).normalize("NFKC").toLocaleLowerCase(lang);
  const keys = new Set();
  const english = source.replace(/\bof\b|\bthe\b/g, " ").replace(/[,]/g, " ");
  const monthPattern = [...monthNumbers.keys()].join("|");
  for (const match of english.matchAll(new RegExp(`(${monthPattern})\\s+(\\d{1,2}|[a-z]+(?:\\s+[a-z]+)?)|([a-z]+(?:\\s+[a-z]+)?)\\s+(${monthPattern})`, "g"))) {
    const month = monthNumbers.get(match[1] ?? match[4]);
    const dayText = (match[2] ?? match[3]).replace(/\b\w+\b/g, (word) => word);
    const day = Number(dayText) || ordinalNumbers.get(dayText) || parseEnglishNumber(dayText);
    if (month && day >= 1 && day <= 31) keys.add(`${month}-${day}`);
  }
  for (const match of source.matchAll(/(?:(\d{4}|[零〇一二兩两三四五六七八九]{4})年)?(\d{1,2}|[零〇一二兩两三四五六七八九十百千]+)月(\d{1,2}|[零〇一二兩两三四五六七八九十百千]+)日?/g)) {
    const month = Number(match[2]) || parseChineseNumber(match[2]);
    const day = Number(match[3]) || parseChineseNumber(match[3]);
    if (month && day) keys.add(`${month}-${day}`);
  }
  return keys;
}

function entityMatches(transcript, value, lang, entityType) {
  const normalizedTranscript = normalizeEntity(transcript, lang);
  const expected = normalizeEntity(value, lang);
  if (normalizedTranscript.includes(expected)) return true;
  if (entityType === "numbers") {
    const expectedNumber = parseEnglishNumber(value) ?? parseChineseNumber(value) ?? (/^\d+$/.test(String(value)) ? Number(value) : null);
    return expectedNumber !== null && numericCandidates(transcript).has(String(expectedNumber));
  }
  if (entityType === "dates") {
    const expectedKeys = dateKeys(value, lang);
    const transcriptKeys = dateKeys(transcript, lang);
    if (expectedKeys.size && [...expectedKeys].some((key) => transcriptKeys.has(key))) return true;
  }
  if (!/^\d+$/.test(String(value))) return false;
  const englishDigits = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const chineseDigits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const spokenAliases = [
    String(value).split("").map((digit) => englishDigits[Number(digit)]).join(""),
    String(value).split("").map((digit) => chineseDigits[Number(digit)]).join(""),
  ];
  return spokenAliases.some((alias) => normalizedTranscript.includes(alias));
}

export function evaluateTranscriptionBenchmark(cases, transcripts) {
  const transcriptById = new Map(transcripts.map((result) => [result.caseId, result.transcript ?? ""]));
  const metrics = {};
  for (const lang of ["en-AU", "zh-CN"]) {
    const languageCases = cases.filter((testCase) => testCase.lang === lang && transcriptById.has(testCase.id));
    let edits = 0;
    let referenceTokens = 0;
    let checkedEntities = 0;
    let matchedEntities = 0;
    const entityTypeCounts = {};
    const categoryCounts = {};
    for (const testCase of languageCases) {
      const reference = tokens(testCase.expectedText, lang);
      const hypothesis = tokens(transcriptById.get(testCase.id) ?? "", lang);
      edits += editDistance(reference, hypothesis);
      referenceTokens += reference.length;
      const category = categoryCounts[testCase.category] ?? { cases: 0, criticalEntities: 0, matchedCriticalEntities: 0 };
      category.cases++;
      for (const [entityType, values] of Object.entries(testCase.criticalEntities ?? {})) {
        const entityTypeCount = entityTypeCounts[entityType] ?? { cases: 0, matched: 0 };
        for (const value of values) {
          checkedEntities++;
          category.criticalEntities++;
          if (entityMatches(transcriptById.get(testCase.id) ?? "", value, lang, entityType)) {
            matchedEntities++;
            category.matchedCriticalEntities++;
            entityTypeCount.matched++;
          }
          entityTypeCount.cases++;
        }
        entityTypeCounts[entityType] = entityTypeCount;
      }
      categoryCounts[testCase.category] = category;
    }
    metrics[lang] = {
      cases: languageCases.length,
      wer: referenceTokens ? edits / referenceTokens : null,
      criticalEntityAccuracy: checkedEntities ? matchedEntities / checkedEntities : null,
      criticalEntities: checkedEntities,
      criticalEntityTypes: Object.fromEntries(Object.entries(entityTypeCounts).map(([entityType, counts]) => [
        entityType,
        { ...counts, accuracy: counts.cases ? counts.matched / counts.cases : null },
      ])),
      categories: categoryCounts,
    };
  }
  return metrics;
}

export function transcriptionMetricsMeetThresholds(metrics) {
  return ["en-AU", "zh-CN"].every((lang) =>
    metrics[lang]?.cases >= 50
    && metrics[lang]?.criticalEntities > 0
    && metrics[lang]?.wer != null
    && metrics[lang].wer <= transcriptionThresholds[lang]
    && metrics[lang].criticalEntityAccuracy != null
    && metrics[lang].criticalEntityAccuracy >= transcriptionThresholds.criticalEntityAccuracy
    && ["productIdentifiers", "barcodes", "numbers", "dates"].every((entityType) =>
      metrics[lang].criticalEntityTypes?.[entityType]?.cases > 0
      && metrics[lang].criticalEntityTypes[entityType].accuracy >= transcriptionThresholds.criticalEntityAccuracy),
  );
}

export function evaluateTranscriptionQualityGate({ cases, completedCaseIds, metrics }) {
  const completed = new Set(completedCaseIds);
  const languages = ["en-AU", "zh-CN"];
  const voiceLocaleCoverage = Object.fromEntries(languages.map((lang) => {
    const languageCases = cases.filter((testCase) => testCase.lang === lang);
    return [lang, {
      cases: languageCases.length,
      matchingVoiceCases: languageCases.filter((testCase) => testCase.voiceLocale === lang).length,
      completedCases: languageCases.filter((testCase) => completed.has(testCase.id)).length,
    }];
  }));

  if (languages.some((lang) => voiceLocaleCoverage[lang].cases < 50)) {
    return { status: "BLOCKED", reason: "requires at least 50 cases per target language", voiceLocaleCoverage };
  }
  if (languages.some((lang) => voiceLocaleCoverage[lang].matchingVoiceCases < 50)) {
    return { status: "BLOCKED", reason: "speech sample voice locale does not match the target locale", voiceLocaleCoverage };
  }
  if (languages.some((lang) => voiceLocaleCoverage[lang].completedCases < 50)) {
    return { status: "BLOCKED", reason: "one or more ASR requests were unavailable", voiceLocaleCoverage };
  }

  return {
    status: transcriptionMetricsMeetThresholds(metrics) ? "PASS" : "FAIL",
    reason: undefined,
    voiceLocaleCoverage,
  };
}

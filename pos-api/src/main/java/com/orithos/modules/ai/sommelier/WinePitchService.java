package com.orithos.modules.ai.sommelier;

import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import com.orithos.modules.ai.report.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
public class WinePitchService {

    private static final Logger log = LoggerFactory.getLogger(WinePitchService.class);

    private final ObjectProvider<ChatClient> chatClient;
    private final ObjectProvider<AiGateway> gateway;

    public WinePitchService(ObjectProvider<ChatClient> chatClient) {
        this(chatClient, null);
    }

    @Autowired
    public WinePitchService(ObjectProvider<ChatClient> chatClient, ObjectProvider<AiGateway> gateway) {
        this.chatClient = chatClient;
        this.gateway = gateway;
    }

    /** Gateway-backed path used by authenticated production requests. */
    public String pitch(WineCandidate wine, CustomerWineProfile customer, String length, TenantContext tenant) {
        String fallback = template(wine, customer, length);
        if (!hasVerifiedProfile(wine)) return fallback;
        AiGateway provider = gateway == null ? null : gateway.getIfAvailable();
        if (!validScope(provider, tenant)) return fallback;
        try {
            AiCompletion<String> completion = provider.complete(
                    scope(tenant), AiTask.EXPLANATION,
                    new PromptVersion("sommelier-pitch", "v1", ""),
                    llmUser(wine, customer, length), String.class);
            return clean(completion.value(), fallback);
        } catch (RuntimeException failure) {
            log.debug("Gateway pitch fallback type={}", failure.getClass().getSimpleName());
            return fallback;
        }
    }

    /** Gateway-backed path used by authenticated production requests. */
    public String answer(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts,
                         TenantContext tenant) {
        String fallback = cannedAnswer(wine, question, alts);
        if (!hasVerifiedProfile(wine)) return fallback;
        AiGateway provider = gateway == null ? null : gateway.getIfAvailable();
        if (!validScope(provider, tenant)) return answer(wine, question, alts);
        try {
            AiCompletion<String> completion = provider.complete(
                    scope(tenant), AiTask.EXPLANATION,
                    new PromptVersion("sommelier-answer", "v1", ""),
                    questionUser(wine, question, alts), String.class);
            return clean(completion.value(), fallback);
        } catch (RuntimeException failure) {
            log.debug("Gateway answer fallback type={}", failure.getClass().getSimpleName());
            return fallback;
        }
    }

    private static boolean validScope(AiGateway provider, TenantContext tenant) {
        return provider != null && tenant != null && tenant.vendorId() > 0 && tenant.userId() > 0
                && tenant.requireOutletId() != null && tenant.requireOutletId() > 0;
    }

    private static AiTenantContext scope(TenantContext tenant) {
        return new AiTenantContext(tenant.vendorId(), tenant.requireOutletId(), tenant.userId(),
                CorrelationIdContext.current());
    }

    private static boolean hasVerifiedProfile(WineCandidate wine) {
        return wine != null && wine.profile() != null && !wine.profile().inferred();
    }

    private static String clean(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        return value.replace('"', ' ').replace('\n', ' ').trim();
    }

    public String pitch(WineCandidate wine, CustomerWineProfile customer, String length) {
        String templated = template(wine, customer, length);
        ChatClient client = chatClient.getIfAvailable();
        if (client == null) return templated;
        try {
            String raw = client.prompt()
                    .system("""
                            You are Orion Sommelier, a wine sales assistant standing next to a liquor-store staff member.
                            Write spoken English the staff can say out loud. No markdown, no quotes, no emoji.
                            Use only the supplied product fields. Do not add alcohol strength, region, vintage, awards,
                            production or ageing methods, serving temperature, decanting advice, or unlisted tasting notes.
                            Never recommend a bottle that is not the current product unless asked for an alternative.
                            """)
                    .user(llmUser(wine, customer, length))
                    .call()
                    .content();
            if (raw == null || raw.isBlank()) return templated;
            return raw.replace('"', ' ').replace('\n', ' ').trim();
        } catch (Exception e) {
            log.debug("Pitch LLM fallback type={}", e.getClass().getSimpleName());
            return templated;
        }
    }

    public String answer(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        String fallback = cannedAnswer(wine, question, alts);
        ChatClient client = chatClient.getIfAvailable();
        if (client == null) return fallback;
        try {
            String raw = client.prompt()
                    .system("""
                            You are Orion Sommelier helping a store staff member answer a customer's wine question.
                            Use only the supplied product fields and in-stock alternatives. Answer in the same language
                            as the question in at most two short sentences. Never infer alcohol strength, region, vintage,
                            awards, production or ageing methods, serving temperature, decanting advice, or unlisted aromas.
                            If a requested fact is absent, say that verified details are unavailable. No markdown.
                            """)
                    .user(questionUser(wine, question, alts))
                    .call()
                    .content();
            if (raw == null || raw.isBlank()) return fallback;
            return raw.trim();
        } catch (Exception e) {
            log.debug("Ask LLM fallback type={}", e.getClass().getSimpleName());
            return fallback;
        }
    }

    public String template(WineCandidate wine, CustomerWineProfile customer, String length) {
        WineProfile p = wine.profile();
        if (p == null || p.inferred()) return inferredProfileTemplate(wine, p, customer, length);
        String dry = drynessLabel(p == null ? null : p.dryness());
        String body = bodyLabel(p == null ? null : p.body());
        String varietal = p != null && p.varietal() != null ? p.varietal() : wine.name();
        String food = foodPhrase(customer != null ? customer.food() : (p == null ? List.of() : p.foodTags()));
        String aromas = p == null || p.aromaTags().isEmpty()
                ? "ripe fruit"
                : String.join(" and ", p.aromaTags().subList(0, Math.min(2, p.aromaTags().size()))).toLowerCase(Locale.ROOT);
        String price = wine.effectivePrice() == null ? "" : "$" + wine.effectivePrice().stripTrailingZeros().toPlainString();

        if ("10s".equals(length)) {
            return "This is a " + dry.toLowerCase(Locale.ROOT) + ", " + body.toLowerCase(Locale.ROOT)
                    + " " + varietal + (food.isBlank() ? "." : " — great with " + food + ".");
        }
        if ("30s".equals(length)) {
            return "If you like something " + dry.toLowerCase(Locale.ROOT) + " and "
                    + body.toLowerCase(Locale.ROOT) + ", this " + varietal + " is a strong fit. "
                    + "You'll get " + aromas
                    + (p != null && p.finishNote() != null ? ", with a " + p.finishNote().toLowerCase(Locale.ROOT) : "")
                    + ". " + (food.isBlank() ? "Easy to drink tonight." : "I'd recommend it with " + food + ".");
        }
        return "If you're after something " + dry.toLowerCase(Locale.ROOT) + " and "
                + body.toLowerCase(Locale.ROOT)
                + (food.isBlank() ? "" : " to go with " + food)
                + ", I'd go with this " + price + " " + varietal + ". "
                + "It's showing " + aromas + " and still easy to drink.";
    }

    private static String inferredProfileTemplate(WineCandidate wine, WineProfile profile,
                                                   CustomerWineProfile customer, String length) {
        if (profile == null) return "I don't have verified tasting details for this bottle yet.";
        String varietal = profile.varietal() == null || profile.varietal().isBlank()
                ? wine.name() : profile.varietal();
        StringBuilder text = new StringBuilder("The current style profile lists this ").append(varietal);
        List<String> traits = new java.util.ArrayList<>();
        if (profile.dryness() != null) traits.add(drynessLabel(profile.dryness()).toLowerCase(Locale.ROOT));
        if (profile.body() != null) traits.add(bodyLabel(profile.body()).toLowerCase(Locale.ROOT));
        if (!traits.isEmpty()) text.append(" as ").append(String.join(" and ", traits));
        if (!profile.aromaTags().isEmpty()) {
            text.append(" with profile notes of ")
                    .append(String.join(", ", profile.aromaTags().subList(0, Math.min(3, profile.aromaTags().size()))));
        }
        List<String> foods = customer != null && !customer.food().isEmpty()
                ? customer.food() : profile.foodTags();
        String foodPhrase = foodPhrase(foods);
        if (!foodPhrase.isBlank()) text.append("; suggested pairings include ").append(foodPhrase);
        if ("30s".equals(length) && profile.finishNote() != null && !profile.finishNote().isBlank()) {
            text.append(". The profile also notes a ").append(profile.finishNote().toLowerCase(Locale.ROOT));
        }
        return text.append('.').toString();
    }

    String cannedAnswer(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        WineProfile p = wine.profile();
        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        boolean chinese = containsHan(question);
        String altLine = alts == null || alts.isEmpty()
                ? ""
                : " Try " + alts.get(0).wine().name() + " at $"
                + alts.get(0).wine().effectivePrice().stripTrailingZeros().toPlainString() + " instead.";
        if (chinese && (q.contains("甜") || q.contains("干") || q.contains("口感"))) {
            if (p == null || p.dryness() == null) return "目前没有可核验的干甜度资料。";
            String label = p.dryness() >= 0.75 ? "偏干" : (p.dryness() <= 0.4 ? "偏甜" : "干甜适中");
            return (p.inferred() ? "当前风格资料推测" : "资料显示") + "这款酒" + label + "。";
        }
        if (q.contains("sweet") || q.contains("dry")) {
            if (p == null) return "I don't have verified tasting details for this bottle yet.";
            double d = p != null && p.dryness() != null ? p.dryness() : 0.7;
            String qualifier = p != null && p.inferred() ? "The current style profile suggests " : "";
            if (d >= 0.75) return qualifier + "it's on the dry side." + (q.contains("sweet") ? altLine : "");
            if (d <= 0.4) return qualifier + "it's on the sweeter, fruitier side.";
            return qualifier + "it's more dry than sweet, with a bit of fruit in the middle.";
        }
        if (q.contains("cheap") || q.contains("less") || q.contains("similar")
                || q.contains("便宜") || q.contains("实惠") || q.contains("相似") || q.contains("类似")) {
            return alts == null || alts.isEmpty()
                    ? chinese ? "目前没有找到同风格且有库存的更实惠酒款。"
                            : "I don't have a cheaper in-stock match in the same style right now."
                    : chinese ? "找到一款更实惠的同风格酒款：" + alternativeName(alts.get(0)) + "。"
                            : "Closest cheaper in-stock match:" + altLine;
        }
        if (q.contains("better") || q.contains("upgrade") || q.contains("premium")
                || q.contains("升级") || q.contains("更好")) {
            return alts == null || alts.isEmpty()
                    ? chinese ? "目前没有找到合适的升级款。"
                            : "This is already one of the stronger bottles we have in this style."
                    : chinese ? "可以考虑这款升级选择：" + alternativeName(alts.get(0)) + "。"
                            : "If you want to step up:" + altLine;
        }
        if (q.contains("food") || q.contains("pair") || q.contains("steak") || q.contains("dinner")
                || q.contains("食物") || q.contains("搭配") || q.contains("配餐") || q.contains("佐餐")
                || q.contains("牛排")) {
            if (p == null) return chinese ? "目前没有可核验的餐酒搭配资料。"
                    : "I don't have verified food-pairing details for this bottle yet.";
            if (p.foodTags().isEmpty()) return chinese ? "目前没有可核验的餐酒搭配资料。"
                    : "I don't have verified food-pairing details for this bottle yet.";
            String foods = p == null || p.foodTags().isEmpty()
                    ? "dinner"
                    : p.foodTags().stream().map(food -> chinese ? chineseFood(food) : humanFood(food)).distinct()
                            .collect(Collectors.joining(", "));
            if (chinese) return (p.inferred() ? "当前风格资料建议搭配：" : "资料显示适合搭配：")
                    + foods.replace(", ", "、") + "。";
            return p != null && p.inferred()
                    ? "The current style profile suggests pairing it with " + foods + "."
                    : "Best with " + foods + ".";
        }
        if (p == null) return chinese ? "目前没有可核验的品酒资料。"
                : "I don't have verified tasting details for this bottle yet.";
        if (chinese) {
            List<String> style = new java.util.ArrayList<>();
            if (p.dryness() != null) style.add(chineseDrynessLabel(p.dryness()));
            if (p.body() != null) style.add(chineseBodyLabel(p.body()));
            if (style.isEmpty() && (p.varietal() == null || p.varietal().isBlank())) {
                return "目前没有可核验的品酒资料。";
            }
            String varietal = p.varietal() == null || p.varietal().isBlank() ? "葡萄酒" : p.varietal();
            String description = style.isEmpty() ? varietal : String.join("、", style) + "的" + varietal;
            return (p.inferred() ? "当前风格资料推测" : "资料显示") + "这款酒是" + description + "。";
        }
        String dry = drynessLabel(p == null ? null : p.dryness());
        String body = bodyLabel(p == null ? null : p.body());
        String statement = "It's a " + dry.toLowerCase(Locale.ROOT) + ", " + body.toLowerCase(Locale.ROOT)
                + " " + (p.varietal() != null ? p.varietal() : "wine") + ".";
        return p.inferred() ? "The current style profile suggests " + statement.substring(0, 1).toLowerCase(Locale.ROOT)
                + statement.substring(1) : statement;
    }

    private static boolean containsHan(String text) {
        return text != null && text.codePoints()
                .anyMatch(codePoint -> Character.UnicodeScript.of(codePoint) == Character.UnicodeScript.HAN);
    }

    private static String alternativeName(WineMatcher.ScoredWine alternative) {
        return alternative.wine().name() + "（$"
                + alternative.wine().effectivePrice().stripTrailingZeros().toPlainString() + "）";
    }

    private static String chineseFood(String raw) {
        String canonical = WineLexicon.canonicalFoodOne(raw);
        if (canonical == null) return raw;
        return switch (canonical) {
            case "steak" -> "牛排";
            case "lamb" -> "羊肉";
            case "chicken" -> "鸡肉";
            case "fish" -> "鱼类";
            case "seafood" -> "海鲜";
            case "pasta" -> "意面";
            case "pizza" -> "披萨";
            case "cheese" -> "奶酪";
            case "spicy" -> "辛辣菜肴";
            case "asian" -> "亚洲风味菜";
            case "bbq", "grilled_meat" -> "烧烤";
            case "party" -> "聚会";
            case "gift" -> "送礼";
            case "special" -> "特殊场合";
            default -> canonical.replace('_', ' ');
        };
    }

    private static String chineseDrynessLabel(Double value) {
        if (value < 0.35) return "甜型";
        if (value < 0.55) return "微甜";
        if (value < 0.75) return "干型";
        return "非常干";
    }

    private static String chineseBodyLabel(Double value) {
        if (value < 0.35) return "轻酒体";
        if (value < 0.6) return "中等酒体";
        if (value < 0.82) return "饱满酒体";
        return "非常饱满酒体";
    }

    static String drynessLabel(Double v) {
        if (v == null) return "Dry";
        if (v < 0.35) return "Sweet";
        if (v < 0.55) return "A little fruity";
        if (v < 0.75) return "Dry";
        return "Very Dry";
    }

    static String bodyLabel(Double v) {
        if (v == null) return "Medium";
        if (v < 0.35) return "Light";
        if (v < 0.6) return "Medium";
        if (v < 0.82) return "Full Body";
        return "Very Full Body";
    }

    static String foodPhrase(List<String> foods) {
        if (foods == null || foods.isEmpty()) return "";
        List<String> human = foods.stream().map(WinePitchService::humanFood).toList();
        if (human.size() == 1) return human.get(0);
        return String.join(" or ", human.subList(0, Math.min(2, human.size())));
    }

    static String humanFood(String raw) {
        String c = WineLexicon.canonicalFoodOne(raw);
        if (c == null) return raw;
        return switch (c) {
            case "steak" -> "steak";
            case "lamb" -> "lamb";
            case "chicken" -> "chicken";
            case "fish" -> "fish";
            case "seafood" -> "seafood";
            case "pasta" -> "pasta";
            case "pizza" -> "pizza";
            case "cheese" -> "cheese";
            case "spicy" -> "spicy food";
            case "asian" -> "Asian food";
            case "bbq" -> "BBQ";
            case "grilled_meat" -> "grilled meat";
            default -> c.replace('_', ' ');
        };
    }

    public static String whyUpgrade(WineCandidate from, WineCandidate to) {
        if (from == null || to == null || to.profile() == null) {
            return "A step up in style and finish.";
        }
        WineProfile a = from.profile();
        WineProfile b = to.profile();
        List<String> bits = new java.util.ArrayList<>();
        if (b.body() != null && (a == null || a.body() == null || b.body() > a.body() + 0.08)) {
            bits.add("More body");
        }
        if (!b.foodTags().isEmpty()) bits.add("Better " + humanFood(b.foodTags().get(0)) + " pairing");
        if (b.finishNote() != null) bits.add(b.finishNote());
        if (bits.isEmpty()) bits.add("More complexity");
        return String.join(". ", bits.subList(0, Math.min(3, bits.size()))) + ".";
    }

    private static String llmUser(WineCandidate wine, CustomerWineProfile customer, String length) {
        WineProfile p = wine.profile();
        String target = switch (length) {
            case "10s" -> "Write a 10-second version (one sentence).";
            case "30s" -> "Write a 30-second version (three short sentences).";
            default -> "Write a floor pitch the staff can read in about 12 seconds.";
        };
        return """
                Product: %s
                Price: %s
                Type: %s
                Varietal: %s
                Dryness: %s
                Body: %s
                Aromas: %s
                Palate: %s
                Food: %s
                Finish: %s
                Profile inferred: %s
                Customer food: %s
                Customer occasion: %s
                %s
                """.formatted(
                wine.name(),
                wine.effectivePrice(),
                p == null ? "" : p.wineType(),
                p == null ? "" : p.varietal(),
                drynessLabel(p == null ? null : p.dryness()),
                bodyLabel(p == null ? null : p.body()),
                p == null ? "" : String.join(", ", p.aromaTags()),
                p == null ? "" : String.join(", ", p.palateTags()),
                p == null ? "" : String.join(", ", p.foodTags()),
                p == null ? "" : p.finishNote(),
                p == null || p.inferred(),
                customer == null ? "" : String.join(", ", customer.food()),
                customer == null ? "" : customer.occasion(),
                target
        );
    }

    private static String questionUser(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        WineProfile p = wine.profile();
        String alt = (alts == null || alts.isEmpty())
                ? "none"
                : alts.stream()
                .limit(3)
                .map(s -> s.wine().name() + " $" + s.wine().effectivePrice()
                        + " match " + WineMatcher.pct(s.match()) + "%")
                .collect(Collectors.joining("; "));
        return """
                Current bottle: %s ($%s) %s %s, dryness=%s body=%s aromas=%s palate=%s food=%s finish=%s region=%s vintage=%s profileInferred=%s
                In-stock alternatives: %s
                Customer question: %s
                """.formatted(
                wine.name(),
                wine.effectivePrice(),
                p == null ? "" : p.wineType(),
                p == null ? "" : p.varietal(),
                drynessLabel(p == null ? null : p.dryness()),
                bodyLabel(p == null ? null : p.body()),
                p == null ? "" : String.join(",", p.aromaTags()),
                p == null ? "" : String.join(",", p.palateTags()),
                p == null ? "" : String.join(",", p.foodTags()),
                p == null ? "" : p.finishNote(),
                p == null ? "" : p.region(),
                p == null ? "" : p.vintage(),
                p == null || p.inferred(),
                alt,
                question
        );
    }
}

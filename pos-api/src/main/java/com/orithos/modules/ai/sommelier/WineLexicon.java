package com.orithos.modules.ai.sommelier;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Maps product names / categories onto a structured wine profile.
 * No vector search — liquor SKUs are matched by varietal lexicon + category.
 */
public final class WineLexicon {

    private WineLexicon() {}

    private static final Pattern NON_LETTER = Pattern.compile("[^a-z0-9]+");

    private record Varietal(
            String key,
            String wineType,
            String label,
            double dryness,
            double body,
            double fruitiness,
            double oak,
            double tannin,
            List<String> aroma,
            List<String> palate,
            List<String> food,
            String finish
    ) {}

    private static final List<Varietal> VARIETALS = List.of(
            v("cabernet sauvignon", "red", "Cabernet Sauvignon", 0.90, 0.88, 0.55, 0.70, 0.80,
                    List.of("Blackcurrant", "Oak", "Vanilla"),
                    List.of("Dry", "Full Body", "Structured"),
                    List.of("steak", "lamb", "bbq", "grilled_meat"),
                    "Long, structured finish"),
            v("cabernet", "red", "Cabernet Sauvignon", 0.90, 0.88, 0.55, 0.70, 0.80,
                    List.of("Blackcurrant", "Oak", "Vanilla"),
                    List.of("Dry", "Full Body", "Structured"),
                    List.of("steak", "lamb", "bbq", "grilled_meat"),
                    "Long, structured finish"),
            v("pinot noir", "red", "Pinot Noir", 0.70, 0.45, 0.65, 0.35, 0.40,
                    List.of("Cherry", "Berry", "Earth"),
                    List.of("Dry", "Light-Medium", "Silky"),
                    List.of("chicken", "fish", "pasta", "cheese"),
                    "Elegant, lingering finish"),
            v("shiraz", "red", "Shiraz", 0.85, 0.90, 0.70, 0.65, 0.72,
                    List.of("Plum", "Spice", "Oak"),
                    List.of("Dry", "Full Body", "Rich"),
                    List.of("steak", "lamb", "bbq", "grilled_meat"),
                    "Long, spicy finish"),
            v("syrah", "red", "Shiraz", 0.85, 0.90, 0.70, 0.65, 0.72,
                    List.of("Plum", "Spice", "Oak"),
                    List.of("Dry", "Full Body", "Rich"),
                    List.of("steak", "lamb", "bbq", "grilled_meat"),
                    "Long, spicy finish"),
            v("malbec", "red", "Malbec", 0.82, 0.85, 0.72, 0.55, 0.68,
                    List.of("Dark Fruit", "Plum", "Spice"),
                    List.of("Dry", "Full Body", "Smooth"),
                    List.of("steak", "bbq", "grilled_meat"),
                    "Rich dark-fruit finish"),
            v("merlot", "red", "Merlot", 0.75, 0.70, 0.75, 0.50, 0.50,
                    List.of("Plum", "Cherry", "Soft Oak"),
                    List.of("Dry", "Medium-Full", "Smooth"),
                    List.of("pasta", "chicken", "steak", "cheese"),
                    "Soft, approachable finish"),
            v("grenache", "red", "Grenache", 0.70, 0.65, 0.80, 0.40, 0.45,
                    List.of("Berry", "Spice"),
                    List.of("Dry", "Medium", "Fruit-forward"),
                    List.of("bbq", "spicy", "asian", "pizza"),
                    "Juicy, spicy finish"),
            v("tempranillo", "red", "Tempranillo", 0.80, 0.75, 0.60, 0.55, 0.65,
                    List.of("Cherry", "Leather", "Oak"),
                    List.of("Dry", "Medium-Full", "Structured"),
                    List.of("steak", "lamb", "spicy"),
                    "Savoury, oaky finish"),
            v("sangiovese", "red", "Sangiovese", 0.82, 0.65, 0.55, 0.35, 0.60,
                    List.of("Cherry", "Herb"),
                    List.of("Dry", "Medium", "Savoury"),
                    List.of("pasta", "pizza", "cheese"),
                    "Bright, savoury finish"),
            v("chardonnay", "white", "Chardonnay", 0.65, 0.70, 0.55, 0.60, 0.10,
                    List.of("Citrus", "Oak", "Vanilla"),
                    List.of("Dry", "Medium-Full", "Rich"),
                    List.of("chicken", "pasta", "cheese", "fish"),
                    "Creamy, oak-tinged finish"),
            v("sauvignon blanc", "white", "Sauvignon Blanc", 0.80, 0.35, 0.70, 0.05, 0.05,
                    List.of("Citrus", "Herb", "Tropical"),
                    List.of("Dry", "Light", "Crisp"),
                    List.of("fish", "seafood", "chicken"),
                    "Crisp, zesty finish"),
            v("riesling", "white", "Riesling", 0.45, 0.35, 0.75, 0.05, 0.05,
                    List.of("Citrus", "Floral", "Stone Fruit"),
                    List.of("Off-dry", "Light", "Aromatic"),
                    List.of("spicy", "asian", "seafood"),
                    "Bright, lingering acidity"),
            v("pinot grigio", "white", "Pinot Grigio", 0.75, 0.40, 0.55, 0.05, 0.05,
                    List.of("Citrus", "Pear"),
                    List.of("Dry", "Light", "Crisp"),
                    List.of("fish", "seafood", "pasta"),
                    "Clean, fresh finish"),
            v("pinot gris", "white", "Pinot Gris", 0.70, 0.45, 0.60, 0.10, 0.05,
                    List.of("Pear", "Spice"),
                    List.of("Dry", "Light-Medium", "Textured"),
                    List.of("fish", "chicken", "pasta"),
                    "Soft, rounded finish"),
            v("moscato", "white", "Moscato", 0.20, 0.30, 0.90, 0.00, 0.00,
                    List.of("Floral", "Grape", "Peach"),
                    List.of("Sweet", "Light", "Fruity"),
                    List.of("cheese", "party"),
                    "Sweet, fragrant finish"),
            v("prosecco", "sparkling", "Prosecco", 0.55, 0.40, 0.70, 0.00, 0.05,
                    List.of("Apple", "Pear", "Floral"),
                    List.of("Off-dry", "Light", "Fizzy"),
                    List.of("seafood", "party", "gift"),
                    "Fresh, bubbly finish"),
            v("champagne", "champagne", "Champagne", 0.75, 0.50, 0.50, 0.15, 0.05,
                    List.of("Brioche", "Citrus", "Apple"),
                    List.of("Dry", "Medium", "Fine mousse"),
                    List.of("seafood", "gift", "special"),
                    "Fine, lingering bubbles"),
            v("sparkling", "sparkling", "Sparkling", 0.60, 0.40, 0.65, 0.00, 0.05,
                    List.of("Citrus", "Apple"),
                    List.of("Dry", "Light", "Fizzy"),
                    List.of("seafood", "party", "gift"),
                    "Crisp sparkling finish"),
            v("brut", "sparkling", "Sparkling", 0.80, 0.45, 0.50, 0.05, 0.05,
                    List.of("Citrus", "Apple"),
                    List.of("Dry", "Light-Medium", "Crisp"),
                    List.of("seafood", "party", "gift"),
                    "Dry, clean bubbles"),
            v("rose", "rose", "Rosé", 0.65, 0.40, 0.70, 0.10, 0.15,
                    List.of("Strawberry", "Citrus"),
                    List.of("Dry", "Light", "Fresh"),
                    List.of("seafood", "chicken", "party", "bbq"),
                    "Fresh berry finish"),
            v("rosé", "rose", "Rosé", 0.65, 0.40, 0.70, 0.10, 0.15,
                    List.of("Strawberry", "Citrus"),
                    List.of("Dry", "Light", "Fresh"),
                    List.of("seafood", "chicken", "party", "bbq"),
                    "Fresh berry finish"),
            v("port", "fortified", "Port", 0.25, 0.92, 0.85, 0.70, 0.40,
                    List.of("Dried Fruit", "Spice", "Oak"),
                    List.of("Sweet", "Full Body", "Rich"),
                    List.of("cheese"),
                    "Lush, warming finish"),
            v("sherry", "fortified", "Sherry", 0.55, 0.80, 0.45, 0.50, 0.25,
                    List.of("Nut", "Oak"),
                    List.of("Dry-to-sweet", "Full", "Oxidative"),
                    List.of("cheese"),
                    "Nutty, lingering finish")
    );

    private static Varietal v(String key, String wineType, String label,
                              double dryness, double body, double fruitiness, double oak, double tannin,
                              List<String> aroma, List<String> palate, List<String> food, String finish) {
        return new Varietal(key, wineType, label, dryness, body, fruitiness, oak, tannin, aroma, palate, food, finish);
    }

    public static boolean looksLikeWine(String name, String categoryName, String familyName) {
        if (matchVarietal(normalize(nullToEmpty(name))) != null) {
            return true;
        }
        String blob = blob(name, categoryName, familyName);
        if (containsAny(blob, "wine", "cava", "lambrusco")) {
            return true;
        }
        if (containsAny(blob, "beer", "ale", "lager", "ipa", "stout", "cider", "vodka", "rum",
                "whisky", "whiskey", "gin", "tequila", "brandy")) {
            return false;
        }
        return containsAny(blob, "sparkling", "champagne", "prosecco", "rose", "rosé");
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    public static WineProfile infer(String name, String categoryName, String familyName, String description) {
        String blob = blob(name, categoryName, familyName, description);
        Varietal hit = matchVarietal(blob);
        String type = hit != null ? hit.wineType : inferType(blob);
        if (hit != null) {
            return new WineProfile(
                    type,
                    hit.label,
                    inferRegion(blob),
                    inferVintage(name),
                    hit.dryness,
                    hit.body,
                    hit.fruitiness,
                    hit.oak,
                    hit.tannin,
                    hit.aroma,
                    hit.palate,
                    hit.food,
                    hit.finish,
                    true
            );
        }
        return defaultForType(type, inferRegion(blob), inferVintage(name));
    }

    public static String inferType(String blob) {
        String b = normalize(blob);
        if (containsAny(b, "champagne")) return "champagne";
        if (containsAny(b, "prosecco", "sparkling", "cava", "brut")) return "sparkling";
        if (containsAny(b, "port", "sherry", "fortified", "muscat")) return "fortified";
        if (containsAny(b, "rose", "rosé", "rosado")) return "rose";
        if (containsAny(b, "white", "blanc", "chardonnay", "riesling", "grigio", "gris", "moscato")) {
            return "white";
        }
        if (containsAny(b, "red", "noir", "shiraz", "syrah", "cabernet", "merlot", "malbec",
                "grenache", "tempranillo", "sangiovese")) {
            return "red";
        }
        return "red";
    }

    private static WineProfile defaultForType(String type, String region, String vintage) {
        return switch (type == null ? "red" : type) {
            case "white" -> new WineProfile("white", "White Wine", region, vintage,
                    0.70, 0.45, 0.60, 0.20, 0.08,
                    List.of("Citrus", "Floral"), List.of("Dry", "Light-Medium"),
                    List.of("fish", "chicken", "seafood"), "Fresh finish", true);
            case "rose" -> new WineProfile("rose", "Rosé", region, vintage,
                    0.65, 0.40, 0.70, 0.10, 0.15,
                    List.of("Strawberry", "Citrus"), List.of("Dry", "Light", "Fresh"),
                    List.of("seafood", "chicken", "party"), "Fresh berry finish", true);
            case "sparkling" -> new WineProfile("sparkling", "Sparkling", region, vintage,
                    0.60, 0.40, 0.65, 0.00, 0.05,
                    List.of("Apple", "Citrus"), List.of("Dry", "Light", "Fizzy"),
                    List.of("seafood", "party", "gift"), "Crisp sparkling finish", true);
            case "champagne" -> new WineProfile("champagne", "Champagne", region, vintage,
                    0.75, 0.50, 0.50, 0.15, 0.05,
                    List.of("Brioche", "Citrus"), List.of("Dry", "Medium"),
                    List.of("seafood", "gift", "special"), "Fine lingering bubbles", true);
            case "fortified" -> new WineProfile("fortified", "Fortified", region, vintage,
                    0.30, 0.90, 0.80, 0.65, 0.35,
                    List.of("Dried Fruit", "Oak"), List.of("Rich", "Full Body"),
                    List.of("cheese"), "Warming finish", true);
            default -> new WineProfile("red", "Red Wine", region, vintage,
                    0.78, 0.72, 0.60, 0.50, 0.60,
                    List.of("Berry", "Spice"), List.of("Dry", "Medium-Full"),
                    List.of("steak", "pasta", "bbq"), "Savoury finish", true);
        };
    }

    private static Varietal matchVarietal(String blob) {
        String b = normalize(blob);
        Varietal best = null;
        int bestLen = 0;
        for (Varietal v : VARIETALS) {
            if (b.contains(v.key) && v.key.length() > bestLen) {
                best = v;
                bestLen = v.key.length();
            }
        }
        return best;
    }

    private static String inferRegion(String blob) {
        String b = normalize(blob);
        if (containsAny(b, "barossa")) return "Barossa";
        if (containsAny(b, "mclaren", "mclaren vale")) return "McLaren Vale";
        if (containsAny(b, "hunter")) return "Hunter Valley";
        if (containsAny(b, "margaret river")) return "Margaret River";
        if (containsAny(b, "yarra")) return "Yarra Valley";
        if (containsAny(b, "adelaide")) return "Adelaide Hills";
        if (containsAny(b, "coonawarra")) return "Coonawarra";
        if (containsAny(b, "marlborough")) return "Marlborough";
        if (containsAny(b, "bordeaux")) return "Bordeaux";
        if (containsAny(b, "burgundy", "bourgogne")) return "Burgundy";
        if (containsAny(b, "chianti", "tuscany")) return "Tuscany";
        if (containsAny(b, "rioja")) return "Rioja";
        if (containsAny(b, "napa")) return "Napa";
        if (containsAny(b, "australia", "australian", "sa ", "nsw", "vic ")) return "Australia";
        return null;
    }

    private static String inferVintage(String name) {
        if (name == null) return null;
        var m = Pattern.compile("(19|20)\\d{2}").matcher(name);
        return m.find() ? m.group() : null;
    }

    private static String blob(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p != null && !p.isBlank()) {
                if (!sb.isEmpty()) sb.append(' ');
                sb.append(p);
            }
        }
        return normalize(sb.toString());
    }

    static String normalize(String s) {
        if (s == null) return "";
        String lower = s.toLowerCase(Locale.ROOT);
        lower = lower.replace('é', 'e').replace('è', 'e');
        return NON_LETTER.matcher(lower).replaceAll(" ").trim();
    }

    private static boolean containsAny(String blob, String... keys) {
        for (String k : keys) {
            if (blob.contains(normalize(k))) return true;
        }
        return false;
    }

    public static List<String> canonicalFood(List<String> raw) {
        if (raw == null || raw.isEmpty()) return List.of();
        List<String> out = new ArrayList<>();
        for (String item : raw) {
            String c = canonicalFoodOne(item);
            if (c != null && !out.contains(c)) out.add(c);
        }
        return List.copyOf(out);
    }

    public static String canonicalFoodOne(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String b = normalize(raw);
        if (containsAny(b, "steak", "beef")) return "steak";
        if (containsAny(b, "lamb")) return "lamb";
        if (containsAny(b, "chicken")) return "chicken";
        if (containsAny(b, "fish")) return "fish";
        if (containsAny(b, "seafood", "shrimp", "prawn", "oyster")) return "seafood";
        if (containsAny(b, "pasta")) return "pasta";
        if (containsAny(b, "pizza")) return "pizza";
        if (containsAny(b, "cheese")) return "cheese";
        if (containsAny(b, "spicy", "chilli", "chili")) return "spicy";
        if (containsAny(b, "asian", "chinese", "thai", "indian", "bbq", "chinese bbq")) {
            if (containsAny(b, "bbq", "barbecue", "barbeque")) return "bbq";
            return "asian";
        }
        if (containsAny(b, "bbq", "barbecue", "grill")) return "bbq";
        if (containsAny(b, "grilled", "meat")) return "grilled_meat";
        return b.replace(' ', '_');
    }
}

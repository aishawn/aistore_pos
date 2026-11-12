import { api, searchCustomers, searchProducts } from "@/lib/api";
import {
  AI_ENTITY_LIST_ROUTE as LIST_ROUTE,
  type AiEntity,
} from "@/lib/ai-entity-routing";

export type { AiEntity } from "@/lib/ai-entity-routing";

export type AiOp =
  | "list"
  | "search"
  | "create"
  | "view"
  | "edit"
  | "merge"
  | "import"
  | "export";

export interface NamedEntity {
  id: string;
  name: string;
}

export type EntityActionResult =
  | { kind: "navigate"; href: string; note?: string }
  | { kind: "search_panel"; scope: "product" | "customer"; query: string }
  | { kind: "pick_list"; href: string; note: string }
  | { kind: "message"; text: string };

/** sessionStorage payload for AI → create customer page prefill */
export interface CustomerCreatePrefill {
  firstName: string;
  lastName: string;
  customerGroupId: string;
  code: string;
  email: string;
}

/** sessionStorage payload for AI → edit customer page field patches */
export interface CustomerEditPrefill {
  firstName?: string;
  lastName?: string;
  code?: string;
  email?: string;
  phone?: string;
  mobile?: string;
}

export const CUSTOMER_EDIT_PREFILL_STORAGE_KEY = "orithos:edit-customer-prefill";
export const CUSTOMER_WIZARD_STORAGE_KEY = "orithos:create-customer-wizard";

interface PageLike<T> {
  items?: T[] | null;
}

const EMAIL_IN_TEXT = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;
const CODE_IN_TEXT = /(?:code|编码|代码)\s*[:=：]?\s*([A-Za-z0-9_-]+)/i;
const PHONE_IN_TEXT = /(?:phone|mobile|电话|手机)\s*[:=：]?\s*([+]?[\d\s\-().]{7,20})/i;

function stripCreateNoise(raw: string): string {
  return raw
    .replace(EMAIL_IN_TEXT, " ")
    .replace(CODE_IN_TEXT, " ")
    .replace(PHONE_IN_TEXT, " ")
    .replace(
      /^(?:create|add|new|新建|创建|添加|新增)\s*(?:a\s+)?(?:new\s+)?(?:customer|user|客户|用户)?/i,
      "",
    )
    .replace(/^(?:customer|user|客户|用户)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse optional name / email / code from create/edit query text. */
export function parseCustomerFieldHints(query: string): {
  firstName?: string;
  lastName?: string;
  email?: string;
  code?: string;
  phone?: string;
  searchName?: string;
} {
  const q = query.trim();
  if (!q) return {};

  const email = q.match(EMAIL_IN_TEXT)?.[0];
  const code = q.match(CODE_IN_TEXT)?.[1];
  const phone = q.match(PHONE_IN_TEXT)?.[1]?.replace(/\s+/g, " ").trim();

  const namePart = stripCreateNoise(q);
  let firstName: string | undefined;
  let lastName: string | undefined;
  let searchName: string | undefined;

  if (namePart) {
    searchName = namePart;
    // Chinese names: treat whole string as lastName-ish display; split 2+ chars as last+first
    if (/^[\u4e00-\u9fff]+$/.test(namePart)) {
      if (namePart.length === 1) {
        firstName = namePart;
        lastName = namePart;
      } else {
        lastName = namePart.slice(0, 1);
        firstName = namePart.slice(1);
      }
    } else {
      const parts = namePart.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        firstName = parts[0];
        lastName = "Customer";
      } else {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
    }
  }

  return { firstName, lastName, email, code, phone, searchName };
}

async function fetchDefaultCustomerGroupId(): Promise<string | null> {
  try {
    const page = await api.get<PageLike<{ id: string | number; name?: string }>>(
      "/api/customers/groups",
      { page: 1, size: 50 },
    );
    const items = (page.items ?? []).filter(
      (g) => g.id != null && String(g.id).trim() !== "",
    );
    const preferred =
      items.find((g) => (g.name ?? "").trim().toLowerCase() === "default") ??
      items.find((g) => (g.name ?? "").trim() === "默认分组") ??
      items[0];
    return preferred ? String(preferred.id) : null;
  } catch {
    return null;
  }
}

/** Build required-field defaults and persist for CreateCustomerPage. */
export async function prepareCustomerCreatePrefill(
  query?: string | null,
): Promise<{ prefill: CustomerCreatePrefill; note: string }> {
  const hints = parseCustomerFieldHints(query ?? "");
  const code = hints.code?.trim() || `C${Date.now()}`;
  const firstName = hints.firstName?.trim() || "New";
  const lastName = hints.lastName?.trim() || "Customer";
  const email = hints.email?.trim() || "";
  const groupId = (await fetchDefaultCustomerGroupId()) ?? "";

  const prefill: CustomerCreatePrefill = {
    firstName,
    lastName,
    code: code.slice(0, 64),
    email,
    customerGroupId: groupId,
  };

  if (typeof window !== "undefined") {
    sessionStorage.setItem(CUSTOMER_WIZARD_STORAGE_KEY, JSON.stringify(prefill));
  }

  const note = groupId
    ? "Opened create customer with defaults prefilled. Review and click Save."
    : "Opened create customer with defaults. No customer group found yet — Save will use default.";

  return { prefill, note };
}

function writeCustomerEditPrefill(patch: CustomerEditPrefill): void {
  if (typeof window === "undefined") return;
  const cleaned: CustomerEditPrefill = {};
  if (patch.firstName?.trim()) cleaned.firstName = patch.firstName.trim();
  if (patch.lastName?.trim()) cleaned.lastName = patch.lastName.trim();
  if (patch.code?.trim()) cleaned.code = patch.code.trim();
  if (patch.email?.trim()) cleaned.email = patch.email.trim();
  if (patch.phone?.trim()) cleaned.phone = patch.phone.trim();
  if (patch.mobile?.trim()) cleaned.mobile = patch.mobile.trim();
  if (Object.keys(cleaned).length === 0) return;
  sessionStorage.setItem(CUSTOMER_EDIT_PREFILL_STORAGE_KEY, JSON.stringify(cleaned));
}

/** Extract search needle for edit/delete (prefer name, not email-only noise). */
function customerLookupQuery(query: string): string {
  const hints = parseCustomerFieldHints(query);
  if (hints.searchName) return hints.searchName;
  if (hints.email) return hints.email;
  return query.trim();
}

/** Detect field patches for edit (e.g. email / phone / code in utterance). */
function customerEditPatches(query: string): CustomerEditPrefill {
  const hints = parseCustomerFieldHints(query);
  const patch: CustomerEditPrefill = {};
  // Only apply explicit structured fields for edit — not the lookup name itself
  if (hints.email) patch.email = hints.email;
  if (hints.code) patch.code = hints.code;
  if (hints.phone) {
    patch.phone = hints.phone;
    patch.mobile = hints.phone;
  }
  return patch;
}

function entityLabel(entity: AiEntity): string {
  if (entity === "balance") return "customer balance";
  return entity.replaceAll("_", " ");
}

const CREATE_ROUTE: Partial<Record<AiEntity, string>> = {
  product: "/products/new",
  classification: "/products?dialog=categories",
  supplier: "/suppliers/new",
  order: "/orders/new",
  stocktake: "/products?dialog=stocktake",
  customer: "/customers/new",
  customer_group: "/customer-groups",
  price_list: "/pricelists",
  gift_card: "/giftcards",
  buying_period: "/stock/buying-periods",
};

const MERGE_ROUTE: Partial<Record<AiEntity, string>> = {
  product: "/products/merge",
  customer: "/customers/merge",
};

const IMPORT_ROUTE: Partial<Record<AiEntity, string>> = {
  customer: "/customers",
  product: "/products",
  gift_card: "/giftcards/import",
  supplier: "/stock/import-supplier-products",
};

// Keep action capability explicit. Falling back to a list for an unsupported
// write/import/export request makes the assistant sound more capable than the
// page actually is and can send staff toward the wrong workflow.
const EXPORT_ENTITIES = new Set<AiEntity>(["product", "customer", "gift_card", "stocktake"]);

function withQuery(path: string, q?: string | null): string {
  const trimmed = q?.trim();
  if (!trimmed) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}q=${encodeURIComponent(trimmed)}`;
}

function asEntity(raw?: string | null): AiEntity | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  // "用户" / user → customer (POS has no separate user entity in AI CRUD)
  if (normalized === "user" || normalized === "用户" || normalized === "客户") return "customer";
  return (Object.keys(LIST_ROUTE) as AiEntity[]).includes(normalized as AiEntity)
    ? (normalized as AiEntity)
    : null;
}

function asOp(raw?: string | null): AiOp | null {
  const ops: AiOp[] = [
    "list",
    "search",
    "create",
    "view",
    "edit",
    "merge",
    "import",
    "export",
  ];
  if (!raw) return null;
  return ops.includes(raw as AiOp) ? (raw as AiOp) : null;
}

async function searchNamed(entity: AiEntity, query: string): Promise<NamedEntity[]> {
  const q = query.trim();
  if (!q) return [];

  if (entity === "customer") {
    return (await searchCustomers(q)).map((c) => ({ id: c.id, name: c.name }));
  }
  if (entity === "product") {
    return (await searchProducts(q)).map((p) => ({ id: p.id, name: p.name }));
  }
  if (entity === "supplier") {
    const page = await api.get<PageLike<{ id: string | number; name: string }>>("/api/suppliers", {
      name: q,
      page: 1,
      size: 20,
    });
    return (page.items ?? []).map((r) => ({ id: String(r.id), name: r.name }));
  }
  if (entity === "customer_group") {
    const page = await api.get<PageLike<{ id: string | number; name: string }>>(
      "/api/customers/groups",
      { name: q, page: 1, size: 20 },
    );
    return (page.items ?? []).map((r) => ({ id: String(r.id), name: r.name }));
  }
  if (entity === "price_list") {
    const page = await api.get<PageLike<{ id: string | number; name: string }>>("/api/price-lists", {
      name: q,
      page: 1,
      size: 20,
    });
    return (page.items ?? []).map((r) => ({ id: String(r.id), name: r.name }));
  }
  if (entity === "order") {
    const page = await api.get<PageLike<{ id: string | number; orderNumber?: string; supplierName?: string }>>(
      "/api/orders",
      { q, page: 1, size: 20 },
    );
    return (page.items ?? []).map((r) => ({
      id: String(r.id),
      name: r.orderNumber || r.supplierName || String(r.id),
    }));
  }
  return [];
}

function viewPath(entity: AiEntity, id: string): string | null {
  switch (entity) {
    case "product":
      return `/products/${id}/view`;
    case "customer":
      return `/customers/${id}/view`;
    case "customer_group":
      return `/customer-groups/${id}/view`;
    case "order":
      return `/orders/${id}/view`;
    // The current supplier source of truth is the read-only Orithos directory;
    // there is no safe supplier detail route here. The caller will open the
    // directory with the lookup query instead of entering an edit form.
    case "supplier":
      return null;
    default:
      return null;
  }
}

function editPath(entity: AiEntity, id: string): string | null {
  switch (entity) {
    case "product":
      return `/products/${id}/edit`;
    case "customer":
      return `/customers/${id}/edit`;
    case "customer_group":
      return `/customer-groups/${id}/edit`;
    case "order":
      return `/orders/${id}/edit`;
    case "supplier":
      return `/suppliers/${id}/edit`;
    default:
      return null;
  }
}

async function resolveOne(
  entity: AiEntity,
  query: string,
): Promise<{ one?: NamedEntity; many?: NamedEntity[] }> {
  const hits = await searchNamed(entity, query);
  if (hits.length === 1) return { one: hits[0] };
  if (hits.length > 1) return { many: hits };
  return {};
}

/** Map entity_action slots to UI navigation / confirm-delete. */
export async function resolveEntityAction(
  entityRaw: string | undefined,
  opRaw: string | undefined,
  queryRaw: string | undefined,
): Promise<EntityActionResult> {
  const entity = asEntity(entityRaw);
  const parsedOp = asOp(opRaw);
  const query = queryRaw?.trim() ?? "";

  if (!entity) {
    return { kind: "message", text: "I could not tell which Inventory/Customer item to manage. Try e.g. “delete customer xiaoli”." };
  }
  if (opRaw?.trim() && !parsedOp) {
    return { kind: "message", text: "That action is not supported. Try listing or searching for the item instead." };
  }

  const op = parsedOp ?? "list";
  const list = LIST_ROUTE[entity];

  switch (op) {
    case "list":
      return { kind: "navigate", href: list };

    case "search":
      if (entity === "product" || entity === "customer") {
        return { kind: "search_panel", scope: entity, query };
      }
      return {
        kind: "navigate",
        href: withQuery(list, query),
        note: query ? `Opened ${entityLabel(entity)} search for “${query}”.` : undefined,
      };

    case "create": {
      const noteReview = "Required fields prefilled — review and click Save.";
      if (entity === "customer") {
        const { note } = await prepareCustomerCreatePrefill(query);
        return { kind: "navigate", href: "/customers/new", note };
      }
      if (entity === "supplier") {
        const { prepareSupplierCreatePrefill } = await import("@/lib/ai-create-prefill");
        await prepareSupplierCreatePrefill(query);
        return { kind: "navigate", href: "/suppliers/new", note: noteReview };
      }
      if (entity === "order") {
        return {
          kind: "navigate",
          href: "/orders/new",
          note: "Opened new order with defaults — review and click Create.",
        };
      }
      if (entity === "customer_group") {
        const { prepareCustomerGroupCreatePrefill, withAiCreateFlag } = await import(
          "@/lib/ai-create-prefill"
        );
        await prepareCustomerGroupCreatePrefill(query);
        return {
          kind: "navigate",
          href: withAiCreateFlag("/customer-groups"),
          note: noteReview,
        };
      }
      if (entity === "product") {
        const { prepareProductCreatePrefill } = await import("@/lib/ai-create-prefill");
        await prepareProductCreatePrefill(query);
        return {
          kind: "navigate",
          href: "/products/new",
          note: "Opened create product with defaults prefilled. Review and click Save.",
        };
      }
      if (entity === "classification") {
        const { prepareClassificationCreatePrefill, withAiCreateFlag } = await import(
          "@/lib/ai-create-prefill"
        );
        await prepareClassificationCreatePrefill(query);
        return {
          kind: "navigate",
          href: withAiCreateFlag("/products?dialog=categories"),
          note: noteReview,
        };
      }
      if (entity === "price_list") {
        const { preparePriceListCreatePrefill, withAiCreateFlag } = await import(
          "@/lib/ai-create-prefill"
        );
        await preparePriceListCreatePrefill(query);
        return {
          kind: "navigate",
          href: withAiCreateFlag("/pricelists"),
          note: noteReview,
        };
      }
      if (entity === "stocktake") {
        const { prepareStocktakeCreatePrefill, withAiCreateFlag } = await import(
          "@/lib/ai-create-prefill"
        );
        await prepareStocktakeCreatePrefill(query);
        return {
          kind: "navigate",
          href: withAiCreateFlag("/products?dialog=stocktake"),
          note: noteReview,
        };
      }
      if (entity === "buying_period") {
        const { prepareBuyingPeriodCreatePrefill, withAiCreateFlag } = await import(
          "@/lib/ai-create-prefill"
        );
        await prepareBuyingPeriodCreatePrefill(query);
        return {
          kind: "navigate",
          href: withAiCreateFlag("/stock/buying-periods"),
          note: noteReview,
        };
      }
      if (entity === "gift_card") {
        return {
          kind: "navigate",
          href: "/giftcards/import",
          note: "Gift cards are created via Import — opened the import page.",
        };
      }
      if (!CREATE_ROUTE[entity]) {
        return {
          kind: "message",
          text: `Creating ${entityLabel(entity)} from the assistant is not available. Open the relevant page and complete the form there.`,
        };
      }
      const href = CREATE_ROUTE[entity] ?? list;
      return {
        kind: "navigate",
        href,
        note: `Opened ${entityLabel(entity)} create flow.`,
      };
    }

    case "merge": {
      const href = MERGE_ROUTE[entity];
      if (!href) {
        return { kind: "message", text: `Merge is not available for ${entityLabel(entity)}.` };
      }
      return { kind: "navigate", href };
    }

    case "import": {
      const href = IMPORT_ROUTE[entity];
      if (!href) {
        return {
          kind: "message",
          text: `Import is not available for ${entityLabel(entity)} from the assistant.`,
        };
      }
      return {
        kind: "navigate",
        href,
        note: "Opened the page — use Import on this screen.",
      };
    }

    case "export":
      if (!EXPORT_ENTITIES.has(entity)) {
        return {
          kind: "message",
          text: `Export is not available for ${entityLabel(entity)} from the assistant.`,
        };
      }
      return {
        kind: "navigate",
        href: list,
        note: "Opened the list — use Export on this screen.",
      };

    case "view":
    case "edit": {
      if (!query) {
        return { kind: "navigate", href: list, note: `Opened ${entityLabel(entity)} list. Specify a name to open one record.` };
      }
      if (op === "view" && entity === "supplier") {
        return {
          kind: "navigate",
          href: withQuery(list, query),
          note: `Opened the read-only supplier directory for “${query}”.`,
        };
      }
      const lookup =
        entity === "customer" ? customerLookupQuery(query) : query;
      const resolved = await resolveOne(entity, lookup);
      if (resolved.one) {
        if (op === "edit" && entity === "customer") {
          writeCustomerEditPrefill(customerEditPatches(query));
        }
        const href =
          op === "view" ? viewPath(entity, resolved.one.id) : editPath(entity, resolved.one.id);
        if (href) {
          return {
            kind: "navigate",
            href,
            note:
              op === "edit" && entity === "customer"
                ? "Opened customer edit. Review any prefilled changes, then Save."
                : undefined,
          };
        }
      }
      if (resolved.many?.length) {
        const names = resolved.many.slice(0, 5).map((h) => h.name).join(", ");
        return {
          kind: "pick_list",
          href: withQuery(list, lookup),
          note: `Found multiple matches (${names}). Opened the list so you can pick one.`,
        };
      }
      return {
        kind: "pick_list",
        href: withQuery(list, lookup),
        note: `No exact match for “${lookup}”. Opened the list.`,
      };
    }

    default:
      return { kind: "navigate", href: list };
  }
}

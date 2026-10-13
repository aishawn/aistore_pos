import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";
const MAX_LIMIT = 100;

const RECORD_TYPES = {
  products: {
    model: "product.product",
    fields: ["id", "name", "display_name", "barcode", "default_code", "list_price", "qty_available", "uom_id", "pos_categ_ids", "available_in_pos"],
    order: "name asc, id asc",
    searchFields: ["name", "barcode", "default_code"],
    baseDomain: [["available_in_pos", "=", true]],
  },
  posCategories: {
    model: "pos.category",
    fields: ["id", "name", "parent_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  customers: {
    model: "res.partner",
    fields: ["id", "name", "phone", "email", "customer_rank", "ref"],
    order: "name asc, id asc",
    searchFields: ["name", "phone", "email", "ref"],
    baseDomain: [["customer_rank", ">", 0]],
  },
  suppliers: {
    model: "res.partner",
    fields: ["id", "name", "phone", "email", "vat", "ref", "supplier_rank"],
    order: "name asc, id asc",
    searchFields: ["name", "phone", "email", "vat", "ref"],
    baseDomain: [["supplier_rank", ">", 0]],
  },
  outlets: {
    model: "res.company",
    fields: ["id", "name", "currency_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  registers: {
    model: "pos.config",
    fields: ["id", "name", "company_id", "current_session_id", "payment_method_ids", "available_pricelist_ids"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  sessions: {
    model: "pos.session",
    fields: ["id", "name", "state", "config_id", "user_id", "start_at", "stop_at"],
    order: "start_at desc, id desc",
    searchFields: ["name"],
    baseDomain: [],
  },
  paymentMethods: {
    model: "pos.payment.method",
    fields: ["id", "name", "type", "journal_id", "is_cash_count"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [],
  },
  taxes: {
    model: "account.tax",
    fields: ["id", "name", "amount", "amount_type", "type_tax_use", "price_include", "company_id"],
    order: "name asc, id asc",
    searchFields: ["name"],
    baseDomain: [["type_tax_use", "=", "sale"], ["active", "=", true]],
  },
  sales: {
    model: "pos.order",
    fields: ["id", "name", "pos_reference", "date_order", "amount_total", "amount_tax", "state", "partner_id", "session_id", "user_id"],
    order: "date_order desc, id desc",
    searchFields: ["name", "pos_reference"],
    baseDomain: [],
  },
} as const;

type RecordType = keyof typeof RECORD_TYPES;

function getOdooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("Odoo connection must use HTTPS");
  }
  return value;
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: { type?: string; query?: string; limit?: number; offset?: number; categoryId?: number; filters?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid records request" }, { status: 400 });
  }

  const type = body.type as RecordType | undefined;
  if (!type || !(type in RECORD_TYPES)) {
    return NextResponse.json({ message: "Unsupported Odoo record type" }, { status: 400 });
  }
  const config = RECORD_TYPES[type];
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(Number(body.limit) || 40)));
  const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
  const query = body.query?.trim().slice(0, 120);
  const domain: unknown[] = [...config.baseDomain];
  if (type === "products" && body.categoryId !== undefined) {
    if (!Number.isInteger(body.categoryId) || body.categoryId <= 0) {
      return NextResponse.json({ message: "Product category is invalid" }, { status: 400 });
    }
    domain.push(["pos_categ_ids", "in", [body.categoryId]]);
  }
  if (query) {
    const clauses = config.searchFields.map((field) => [field, "ilike", query]);
    if (clauses.length === 1) domain.push(clauses[0]);
    else {
      domain.push(...Array(clauses.length - 1).fill("|"), ...clauses);
    }
  }

  // Filters are deliberately not forwarded from the browser. The initial
  // bridge only exposes named, read-only datasets with fixed model/field lists.
  try {
    const response = await fetch(`${getOdooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `session_id=${sessionId}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: config.model,
          method: "search_read",
          args: [domain],
          kwargs: { fields: [...config.fields], limit, offset, order: config.order },
        },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Odoo records are unavailable" }, { status: 502 });
    const payload = (await response.json()) as {
      result?: unknown[];
      error?: { message?: string; data?: { message?: string } };
    };
    if (payload.error) {
      const status = /session|log in|authenticate/i.test(payload.error.message ?? "") ? 401 : 502;
      return NextResponse.json({ message: status === 401 ? "Odoo session expired" : "Odoo could not load records" }, { status });
    }
    return NextResponse.json({ items: payload.result ?? [], limit, offset }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

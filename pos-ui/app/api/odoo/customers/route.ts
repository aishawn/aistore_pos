import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { withRequestCorrelation } from "@/lib/request-correlation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "orithos_odoo_session";

function odooBaseUrl() {
  const value = process.env.ODOO_BASE_URL?.trim().replace(/\/+$/, "");
  if (!value) throw new Error("Odoo connection is not configured");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Odoo connection must use HTTPS");
  return value;
}

function parseCustomerValues(body: Record<string, unknown>, { requireName }: { requireName: boolean }) {
  const allowed = new Set([
    "name", "phone", "email", "ref", "street", "city", "vat", "company_type",
    "property_product_pricelist", "category_id",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { error: NextResponse.json({ message: "This customer request contains unsupported fields" }, { status: 400 }) };
  }

  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const email = typeof body.email === "string" ? body.email.trim() : undefined;
  const reference = typeof body.ref === "string" ? body.ref.trim() : undefined;
  const street = typeof body.street === "string" ? body.street.trim() : undefined;
  const city = typeof body.city === "string" ? body.city.trim() : undefined;
  const vat = typeof body.vat === "string" ? body.vat.trim() : undefined;
  const companyType = typeof body.company_type === "string" ? body.company_type.trim() : undefined;

  if (requireName && (!name || name.length > 120)) {
    return { error: NextResponse.json({ message: "Customer name is required and must be 120 characters or fewer" }, { status: 400 }) };
  }
  if (name !== undefined && (!name || name.length > 120)) {
    return { error: NextResponse.json({ message: "Customer name is required and must be 120 characters or fewer" }, { status: 400 }) };
  }
  if ((phone?.length ?? 0) > 32 || (email?.length ?? 0) > 254 || (reference?.length ?? 0) > 64) {
    return { error: NextResponse.json({ message: "Phone, email or reference is too long" }, { status: 400 }) };
  }
  if ((street?.length ?? 0) > 128 || (city?.length ?? 0) > 64 || (vat?.length ?? 0) > 64) {
    return { error: NextResponse.json({ message: "Street, city or ABN/VAT is too long" }, { status: 400 }) };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: NextResponse.json({ message: "Enter a valid email address" }, { status: 400 }) };
  }
  if (companyType !== undefined && companyType !== "person" && companyType !== "company") {
    return { error: NextResponse.json({ message: "Company type must be person or company" }, { status: 400 }) };
  }

  let pricelistId: number | false | undefined;
  if ("property_product_pricelist" in body) {
    if (body.property_product_pricelist === null || body.property_product_pricelist === false || body.property_product_pricelist === "") {
      pricelistId = false;
    } else if (typeof body.property_product_pricelist === "number" && Number.isSafeInteger(body.property_product_pricelist) && body.property_product_pricelist >= 1) {
      pricelistId = body.property_product_pricelist;
    } else {
      return { error: NextResponse.json({ message: "Price list must be a valid Odoo id" }, { status: 400 }) };
    }
  }

  let categoryIds: number[] | undefined;
  if ("category_id" in body) {
    if (!Array.isArray(body.category_id) || body.category_id.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)) {
      return { error: NextResponse.json({ message: "Customer groups must be a list of Odoo ids" }, { status: 400 }) };
    }
    if (body.category_id.length > 40) {
      return { error: NextResponse.json({ message: "Too many customer groups selected" }, { status: 400 }) };
    }
    categoryIds = body.category_id as number[];
  }

  const values: Record<string, string | false | number | unknown[]> = {};
  if (name !== undefined) values.name = name;
  if (phone !== undefined) values.phone = phone || false;
  if (email !== undefined) values.email = email || false;
  if (reference !== undefined) values.ref = reference || false;
  if (street !== undefined) values.street = street || false;
  if (city !== undefined) values.city = city || false;
  if (vat !== undefined) values.vat = vat || false;
  if (companyType !== undefined) values.company_type = companyType;
  if (pricelistId !== undefined) values.property_product_pricelist = pricelistId;
  if (categoryIds !== undefined) values.category_id = [[6, 0, categoryIds]];

  return { values, name };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return NextResponse.json({ message: "Odoo session expired" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid customer request" }, { status: 400 });
  }

  const parsed = parseCustomerValues(body, { requireName: true });
  if ("error" in parsed && parsed.error) return parsed.error;
  const values = { ...parsed.values!, type: "contact", customer_rank: 1 };

  try {
    const response = await fetch(`${odooBaseUrl()}/web/dataset/call_kw`, {
      method: "POST",
      headers: withRequestCorrelation({ "Content-Type": "application/json", Cookie: `session_id=${sessionId}` }, request),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: {
          model: "res.partner",
          method: "create",
          args: [values],
          kwargs: {},
        },
        id: Date.now(),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json({ message: "Odoo customer service is unavailable" }, { status: 502 });
    const payload = await response.json() as { result?: unknown; error?: { message?: string; data?: { message?: string; name?: string } } };
    if (payload.error) {
      const detail = `${payload.error.message ?? ""} ${payload.error.data?.name ?? ""}`;
      if (/session|authenticate|log in/i.test(detail)) return NextResponse.json({ message: "Your Odoo session has expired. Sign in to Odoo again." }, { status: 401 });
      if (/accesserror|access denied|permission/i.test(detail)) return NextResponse.json({ message: "Your Odoo account does not have permission to create customers." }, { status: 403 });
      return NextResponse.json({ message: "Odoo rejected the customer record. Check that the contact details are valid." }, { status: 422 });
    }
    if (!Number.isSafeInteger(payload.result) || Number(payload.result) < 1) return NextResponse.json({ message: "Odoo did not confirm the new customer" }, { status: 502 });
    return NextResponse.json({ id: payload.result, name: parsed.name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Odoo is unavailable";
    const status = message.includes("not configured") || message.includes("must use HTTPS") ? 503 : 502;
    return NextResponse.json({ message }, { status });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { customerWriteScope } from "@/lib/customer-access";
import { OdooScopeError } from "@/lib/odoo-scope";
import { StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCustomerValues(body: Record<string, unknown>) {
  const allowed = new Set([
    "name", "phone", "email", "comment", "ref", "street", "city", "vat", "company_type",
    "property_product_pricelist", "category_id",
  ]);
  if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.has(key))) {
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
      return { error: NextResponse.json({ message: "Price list must be a valid Orithos id" }, { status: 400 }) };
    }
  }

  let categoryIds: number[] | undefined;
  if ("category_id" in body) {
    if (!Array.isArray(body.category_id) || body.category_id.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)) {
      return { error: NextResponse.json({ message: "Customer groups must be a list of Orithos ids" }, { status: 400 }) };
    }
    if (body.category_id.length > 40) {
      return { error: NextResponse.json({ message: "Too many customer groups selected" }, { status: 400 }) };
    }
    categoryIds = body.category_id as number[];
  }

  if ("comment" in body && (typeof body.comment !== "string" || body.comment.length > 4000)) return { error: NextResponse.json({ message: "Notes must be text of 4,000 characters or fewer" }, { status: 400 }) };
  const values: Record<string, string | false | number | unknown[]> = {};
  if (typeof body.comment === "string") values.comment = body.comment.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  if (Object.keys(values).length === 0) {
    return { error: NextResponse.json({ message: "No valid customer fields were provided" }, { status: 400 }) };
  }
  return { values };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });

  const { id: rawId } = await context.params;
  const customerId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(customerId) || customerId < 1) return NextResponse.json({ message: "Invalid customer ID" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json() as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Invalid customer request" }, { status: 400 });
  }

  const parsed = parseCustomerValues(body);
  if ("error" in parsed && parsed.error) return parsed.error;

  try {
    const scope = await customerWriteScope(request, parsed.values!, customerId);
    const ok = await scope.rpc<boolean>("res.partner", "write", [[customerId], parsed.values]);
    if (!ok) return NextResponse.json({ message: "Orithos did not confirm the customer update" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ message: "Cross-origin requests are not allowed" }, { status: 403 });

  const { id: rawId } = await context.params;
  const customerId = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(customerId) || customerId < 1) return NextResponse.json({ message: "Invalid customer ID" }, { status: 400 });

  try {
    const scope = await customerWriteScope(request, { active: false }, customerId);
    const ok = await scope.rpc<boolean>("res.partner", "write", [[customerId], { active: false }]);
    if (!ok) return NextResponse.json({ message: "Orithos did not confirm the customer archive" }, { status: 502 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

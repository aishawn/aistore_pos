import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server-auth";
import { customerWriteScope } from "@/lib/customer-access";
import { OdooScopeError } from "@/lib/odoo-scope";
import { StoreAccessError } from "@/lib/store-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const scope = await customerWriteScope(request, values);
    const id = await scope.rpc<number>("res.partner", "create", [{ ...values, company_id: scope.companyIds[0] }]);
    if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ message: "Orithos did not confirm the new customer" }, { status: 502 });
    return NextResponse.json({ id, name: parsed.name }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Orithos is unavailable";
    const status = error instanceof OdooScopeError || error instanceof StoreAccessError ? error.status : 502;
    return NextResponse.json({ message }, { status });
  }
}

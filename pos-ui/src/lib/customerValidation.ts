export const CUSTOMER_FIELD_LIMITS = {
  firstName: 128,
  lastName: 128,
  name: 255,
  company: 255,
  code: 64,
  email: 255,
  phone: 64,
  mobile: 64,
  fax: 64,
  website: 255,
  twitter: 255,
  facebook: 255,
  billingStreetAddress1: 255,
  billingStreetAddress2: 255,
  billingSuburb: 128,
  billingPostCode: 16,
  billingRegion: 128,
  billingCountry: 128,
  deliveryStreetAddress1: 255,
  deliveryStreetAddress2: 255,
  deliverySuburb: 128,
  deliveryPostCode: 16,
  deliveryRegion: 128,
  deliveryCountry: 128,
  businessNumber: 64,
  gender: 32,
  invoiceMessage: 4000,
  comments: 4000,
} as const;

export type CustomerFieldLimitKey = keyof typeof CUSTOMER_FIELD_LIMITS;

export const CUSTOMER_LOYALTY_POINTS_MAX = 999_999_999_999.9999;

const EMAIL_PATTERN = /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/;
const PHONE_PATTERN = /^[+]?[\d\s\-().]+$/;
const PURE_DIGITS = /^\d+$/;
const LOYALTY_POINTS_PATTERN = /^\d+(\.\d{1,4})?$/;

export function getCustomerFieldLimit(key: string): number | undefined {
  const normalizedKey = key === "emails" ? "email" : key;
  if (normalizedKey in CUSTOMER_FIELD_LIMITS) {
    return CUSTOMER_FIELD_LIMITS[normalizedKey as CustomerFieldLimitKey];
  }
  return undefined;
}

export function isPureDigits(value: string): boolean {
  return PURE_DIGITS.test(value.trim());
}

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return (
    trimmed.length > 0 &&
    trimmed.length <= CUSTOMER_FIELD_LIMITS.email &&
    EMAIL_PATTERN.test(trimmed)
  );
}

export function isValidPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return true;
  if (trimmed.length > CUSTOMER_FIELD_LIMITS.phone) return false;
  const digits = trimmed.replace(/\D/g, "");
  return (
    digits.length >= 7 &&
    digits.length <= 15 &&
    PHONE_PATTERN.test(trimmed)
  );
}

export function isValidLoyaltyPoints(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!LOYALTY_POINTS_PATTERN.test(trimmed)) return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 && num <= CUSTOMER_LOYALTY_POINTS_MAX;
}

export type CustomerValidationSection =
  | "general"
  | "contact"
  | "social"
  | "billing"
  | "delivery"
  | "loyalty"
  | "pricing"
  | "misc";

export interface CustomerFieldInput {
  firstName: string;
  lastName: string;
  company?: string;
  code: string;
  customerGroupId: string;
  emails: string[];
  phone?: string;
  mobile?: string;
  fax?: string;
  website?: string;
  twitter?: string;
  facebook?: string;
  billingStreetAddress1?: string;
  billingStreetAddress2?: string;
  billingSuburb?: string;
  billingPostCode?: string;
  billingRegion?: string;
  billingCountry?: string;
  deliveryStreetAddress1?: string;
  deliveryStreetAddress2?: string;
  deliverySuburb?: string;
  deliveryPostCode?: string;
  deliveryRegion?: string;
  deliveryCountry?: string;
  loyaltyPoints?: string;
  businessNumber?: string;
  gender?: string;
  invoiceMessage?: string;
  comments?: string;
}

type ValidationError = { message: string; section: CustomerValidationSection };

function optionalLengthError(
  value: string | undefined,
  max: number,
  label: string,
  section: CustomerValidationSection,
): ValidationError | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max) {
    return {
      message: `${label} must be at most ${max} characters.`,
      section,
    };
  }
  return null;
}

function buildDisplayName(firstName: string, lastName: string, company?: string): string {
  const person = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  if (person) return person;
  if (company?.trim()) return company.trim();
  return "Untitled Customer";
}

export function validateCustomerFields(
  form: CustomerFieldInput,
): ValidationError | null {
  const firstName = form.firstName.trim();
  const lastName = form.lastName.trim();
  const code = form.code.trim();

  if (!firstName) {
    return { message: "First name is required.", section: "general" };
  }
  if (firstName.length > CUSTOMER_FIELD_LIMITS.firstName) {
    return {
      message: `First name must be at most ${CUSTOMER_FIELD_LIMITS.firstName} characters.`,
      section: "general",
    };
  }
  if (isPureDigits(firstName)) {
    return { message: "First name cannot be numbers only.", section: "general" };
  }

  if (!lastName) {
    return { message: "Last name is required.", section: "general" };
  }
  if (lastName.length > CUSTOMER_FIELD_LIMITS.lastName) {
    return {
      message: `Last name must be at most ${CUSTOMER_FIELD_LIMITS.lastName} characters.`,
      section: "general",
    };
  }
  if (isPureDigits(lastName)) {
    return { message: "Last name cannot be numbers only.", section: "general" };
  }

  const companyError = optionalLengthError(
    form.company,
    CUSTOMER_FIELD_LIMITS.company,
    "Company",
    "general",
  );
  if (companyError) return companyError;

  const displayName = buildDisplayName(firstName, lastName, form.company);
  if (displayName.length > CUSTOMER_FIELD_LIMITS.name) {
    return {
      message: `Combined customer name must be at most ${CUSTOMER_FIELD_LIMITS.name} characters.`,
      section: "general",
    };
  }

  if (code && code.length > CUSTOMER_FIELD_LIMITS.code) {
    return {
      message: `Code must be at most ${CUSTOMER_FIELD_LIMITS.code} characters.`,
      section: "general",
    };
  }

  const emails = form.emails.map((e) => e.trim()).filter(Boolean);
  for (const email of emails) {
    if (!isValidEmail(email)) {
      return { message: "Email format is invalid.", section: "contact" };
    }
  }

  if (form.phone?.trim() && !isValidPhone(form.phone)) {
    return { message: "Phone format is invalid.", section: "contact" };
  }
  if (form.mobile?.trim() && !isValidPhone(form.mobile)) {
    return { message: "Mobile format is invalid.", section: "contact" };
  }
  if (form.fax?.trim() && !isValidPhone(form.fax)) {
    return { message: "Fax format is invalid.", section: "contact" };
  }

  for (const [value, max, label] of [
    [form.website, CUSTOMER_FIELD_LIMITS.website, "Website"],
    [form.twitter, CUSTOMER_FIELD_LIMITS.twitter, "Twitter"],
    [form.facebook, CUSTOMER_FIELD_LIMITS.facebook, "Facebook"],
  ] as const) {
    const error = optionalLengthError(value, max, label, "social");
    if (error) return error;
  }

  for (const [value, max, label, section] of [
    [form.billingStreetAddress1, CUSTOMER_FIELD_LIMITS.billingStreetAddress1, "Street Address 1", "billing"],
    [form.billingStreetAddress2, CUSTOMER_FIELD_LIMITS.billingStreetAddress2, "Street Address 2", "billing"],
    [form.billingSuburb, CUSTOMER_FIELD_LIMITS.billingSuburb, "Suburb", "billing"],
    [form.billingPostCode, CUSTOMER_FIELD_LIMITS.billingPostCode, "Postcode / ZIP Code", "billing"],
    [form.billingRegion, CUSTOMER_FIELD_LIMITS.billingRegion, "State / Province", "billing"],
    [form.billingCountry, CUSTOMER_FIELD_LIMITS.billingCountry, "Country", "billing"],
    [form.deliveryStreetAddress1, CUSTOMER_FIELD_LIMITS.deliveryStreetAddress1, "Street Address 1", "delivery"],
    [form.deliveryStreetAddress2, CUSTOMER_FIELD_LIMITS.deliveryStreetAddress2, "Street Address 2", "delivery"],
    [form.deliverySuburb, CUSTOMER_FIELD_LIMITS.deliverySuburb, "Suburb", "delivery"],
    [form.deliveryPostCode, CUSTOMER_FIELD_LIMITS.deliveryPostCode, "Postcode / ZIP Code", "delivery"],
    [form.deliveryRegion, CUSTOMER_FIELD_LIMITS.deliveryRegion, "State / Province", "delivery"],
    [form.deliveryCountry, CUSTOMER_FIELD_LIMITS.deliveryCountry, "Country", "delivery"],
  ] as const) {
    const error = optionalLengthError(value, max, label, section);
    if (error) return error;
  }

  if (form.loyaltyPoints?.trim() && !isValidLoyaltyPoints(form.loyaltyPoints)) {
    return { message: "Loyalty points value is invalid.", section: "loyalty" };
  }

  for (const [value, max, label] of [
    [form.businessNumber, CUSTOMER_FIELD_LIMITS.businessNumber, "Business Number"],
    [form.gender, CUSTOMER_FIELD_LIMITS.gender, "Gender"],
    [form.invoiceMessage, CUSTOMER_FIELD_LIMITS.invoiceMessage, "Invoice and Statement Message"],
    [form.comments, CUSTOMER_FIELD_LIMITS.comments, "Comments"],
  ] as const) {
    const error = optionalLengthError(value, max, label, "misc");
    if (error) return error;
  }

  return null;
}

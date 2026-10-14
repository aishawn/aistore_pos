type OdooRelation = [number, string] | false | null | undefined;

const AU_STATE_TIMEZONES: Array<{ match: RegExp; timezone: string }> = [
  { match: /^(?:NSW|New South Wales|Victoria|VIC|Tasmania|TAS|Australian Capital Territory|ACT)(?:\s|$)/i, timezone: "Australia/Sydney" },
  { match: /^(?:Queensland|QLD)(?:\s|$)/i, timezone: "Australia/Brisbane" },
  { match: /^(?:South Australia|SA)(?:\s|$)/i, timezone: "Australia/Adelaide" },
  { match: /^(?:Western Australia|WA)(?:\s|$)/i, timezone: "Australia/Perth" },
  { match: /^(?:Northern Territory|NT)(?:\s|$)/i, timezone: "Australia/Darwin" },
];

function relationName(value: OdooRelation): string {
  return Array.isArray(value) ? String(value[1] ?? "").trim() : "";
}

/** Derive the store's IANA timezone from its Odoo company address, not the user's browser or profile. */
export function getOdooCompanyTimezone(country: OdooRelation, state: OdooRelation): string {
  const countryName = relationName(country);
  const stateName = relationName(state);
  const isAustralia = /^(?:Australia|AU)(?:\s|$)/i.test(countryName);
  if (!isAustralia) return "UTC";
  return AU_STATE_TIMEZONES.find(({ match }) => match.test(stateName))?.timezone ?? "Australia/Adelaide";
}

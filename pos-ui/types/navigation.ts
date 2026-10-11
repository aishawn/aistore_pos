/** A single navigation link in the Orithos menu drawer. */
export interface NavItem {
  label: string;
  /** Route path (internal) or absolute URL (external). */
  href: string;
  /** True for links that leave the app (open in a new tab). */
  external?: boolean;
}

/** A collapsible section of the navigation drawer. */
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Either a standalone top-level link or a collapsible group. */
export type NavEntry =
  | { kind: "item"; item: NavItem }
  | { kind: "group"; group: NavGroup };

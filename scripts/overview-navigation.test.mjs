import assert from "node:assert/strict";
import { test } from "node:test";
import {
  storeLandingPath,
  controlPlaneLandingPath,
} from "../pos-ui/src/lib/tenant-host.ts";
import { getSidebarNavigation } from "../pos-ui/src/lib/sidebar-navigation.ts";
import { buildLaunchDestinations } from "../pos-ui/src/lib/overview-launch.ts";
test("Workspace is the default, explicit Radial/checkout links remain intact", () => {
  assert.equal(storeLandingPath(null), "/dashboard");
  assert.equal(storeLandingPath("/overview"), "/overview");
  assert.equal(storeLandingPath("/?sale=42"), "/?sale=42");
  assert.equal(storeLandingPath(null, "mobile"), "/m");
  assert.equal(
    storeLandingPath("https://external.invalid"),
    "/dashboard",
  );
  assert.equal(controlPlaneLandingPath(null), "/platform/stores");
});
test("Sidebar and launch ring share the Workspace destination", () => {
  const navigation = getSidebarNavigation({ isAdmin: true });
  assert.equal(
    navigation.find((item) => item.label === "Dashboard").href,
    "/dashboard/workspace",
  );
  assert.equal(
    buildLaunchDestinations(navigation).find((item) => item.id === "dashboard")
      .href,
    "/dashboard/workspace",
  );
});
test("Cashier destinations contain only allowed parent and child routes", () => {
  const destinations = buildLaunchDestinations(
    getSidebarNavigation({
      isAdmin: false,
      hasPermission: (key) => ["sell.checkout", "customers.view"].includes(key),
    }),
  );
  assert.deepEqual(
    destinations.map((item) => item.id),
    ["sell", "dashboard", "customers"],
  );
  assert.deepEqual(
    destinations
      .find((item) => item.id === "customers")
      .children.map((item) => item.href),
    ["/customers/odoo"],
  );
});
test("Admin Setup retains all children, including the last diagnostic route", () => {
  const setup = buildLaunchDestinations(
    getSidebarNavigation({ isAdmin: true }),
  ).find((item) => item.id === "setup");
  assert.equal(setup.children.length, 8);
  assert.equal(setup.children.at(-1).href, "/reports/ai/metrics");
});

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedMunicipalities } from "./seed-municipalities";
import { seedCms } from "./seed-cms";

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(
      `${name} is not set. Add it to .env.{env} (see CREDENTIALS.md → First Admin Account).`,
    );
  }
  return value;
}

async function main() {
  // Canonical 3-tier account model (2026-07-10 — tenant_rbac_3tier):
  //   tenantadmin@powerbyteitsolutions.com  role tenant_manager     tenantId null (platform)
  //   webmaster@localhost.com               role tenant_superadmin  attached to the primary tenant
  //   admin@admin.com                       role tenant_admin       attached to the primary tenant
  // Passwords are NEVER hardcoded — always read from env (.env.{env}).
  const tenantAdminPassword = requireEnv("TENANTADMIN_PASSWORD");
  const webmasterPassword = requireEnv("WEBMASTER_PASSWORD");
  const adminPassword = requireEnv("ADMIN_PASSWORD");

  const tenantAdminHash = await bcrypt.hash(tenantAdminPassword, BCRYPT_ROUNDS);
  const webmasterHash = await bcrypt.hash(webmasterPassword, BCRYPT_ROUNDS);
  const adminHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  // Official Philippines tenant — slug "ph" (holds the Philippine MPAs: Apo Reef
  // + municipal MPAs). Future regional tenants (Banggai, Pecca) get their own
  // slugs. Renamed from the former "demo-site" tenant (2026-07-08); existing
  // environments have their tenant row renamed in place (tenant.id preserved).
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ph" },
    // Set currency on update too so existing dev DBs whose tenant row kept the
    // schema default ("IDR") get corrected to PHP on re-seed. Without this the
    // currency snapshot taken at fuel-entry create time (fuelEntry router,
    // spec §196) diverges from the hardcoded "PHP" on seeded fuel rows.
    update: { currency: "PHP" },
    create: {
      name: "Philippines",
      slug: "ph",
      isActive: true,
      timezone: "Asia/Manila",
      syncFrequencySeconds: 300,
      currency: "PHP",
    },
  });

  // Platform account — tenant_manager, tenantId null (cross-tenant, no single
  // owner-per-tenant constraint applies since tenant_id is NULL).
  await prisma.user.upsert({
    where: { email: "tenantadmin@powerbyteitsolutions.com" },
    update: { passwordHash: tenantAdminHash },
    create: {
      email: "tenantadmin@powerbyteitsolutions.com",
      passwordHash: tenantAdminHash,
      fullName: "Tenant Admin",
      role: "tenant_manager",
      isActive: true,
      tenantId: null,
    },
  });

  // Tenant owner — tenant_superadmin. Exactly ONE per tenant is enforced by
  // the "one_tenant_superadmin_per_tenant" partial unique index (migration
  // 20260710093000_tenant_rbac_3tier) — do not seed a second tenant_superadmin
  // for this tenant anywhere else in this file (including SEED_DEV_ACCOUNTS).
  const tenantOwner = await prisma.user.upsert({
    where: { email: "webmaster@localhost.com" },
    update: { passwordHash: webmasterHash },
    create: {
      email: "webmaster@localhost.com",
      passwordHash: webmasterHash,
      fullName: "Webmaster",
      role: "tenant_superadmin",
      isActive: true,
      tenantId: tenant.id,
    },
  });

  // Tenant admin — full tenant access EXCEPT user management (rbac.ts
  // userManagementProcedure deliberately excludes tenant_admin).
  await prisma.user.upsert({
    where: { email: "admin@admin.com" },
    update: { passwordHash: adminHash },
    create: {
      email: "admin@admin.com",
      passwordHash: adminHash,
      fullName: "Admin",
      role: "tenant_admin",
      isActive: true,
      tenantId: tenant.id,
    },
  });

  // Retained as `siteAdmin` alias for the many `createdBy`/`loggedByUserId`
  // references below (tenant-scoped seed data attribution) — points at the
  // tenant owner account created above.
  const siteAdmin = tenantOwner;

  // ── DEV-ONLY standardized login accounts ─────────────────────────────────
  // Owner directive: predictable weak credentials for local development ONLY.
  // GATED on SEED_DEV_ACCOUNTS=true, which is set ONLY in .env.dev — never in
  // .env.staging / .env.prod. This guarantees staging/prod seeds are NOT
  // weakened to these values even though they run the same seed script.
  // admin@mail.com / admin  → tenant_admin (primary tenant — NOT tenant_superadmin;
  //                            webmaster@localhost.com already holds that role and
  //                            the one_tenant_superadmin_per_tenant unique index
  //                            rejects a second tenant_superadmin on the same tenant)
  // user@mail.com  / user   → operator   (lowest normal role, primary tenant)
  if (process.env["SEED_DEV_ACCOUNTS"] === "true") {
    const devAdminHash = await bcrypt.hash("admin", BCRYPT_ROUNDS);
    const devUserHash = await bcrypt.hash("user", BCRYPT_ROUNDS);

    await prisma.user.upsert({
      where: { email: "admin@mail.com" },
      update: { passwordHash: devAdminHash, isActive: true },
      create: {
        email: "admin@mail.com",
        passwordHash: devAdminHash,
        fullName: "Dev Admin",
        role: "tenant_admin",
        isActive: true,
        tenantId: tenant.id,
      },
    });

    await prisma.user.upsert({
      where: { email: "user@mail.com" },
      update: { passwordHash: devUserHash, isActive: true },
      create: {
        email: "user@mail.com",
        passwordHash: devUserHash,
        fullName: "Dev User",
        role: "operator",
        isActive: true,
        tenantId: tenant.id,
      },
    });

    console.log("Dev-only accounts seeded (SEED_DEV_ACCOUNTS=true):");
    console.log("  admin@mail.com / admin  (tenant_admin)");
    console.log("  user@mail.com  / user   (operator)");
  }

  const now = new Date();
  const eventTypes = [
    {
      erEventtypeId: "wildlife_sighting",
      value: "wildlife_sighting",
      display: "Wildlife Sighting",
      category: "observation",
      defaultPriority: 100,
      isActive: true,
      syncedAt: now,
    },
    {
      erEventtypeId: "illegal_fishing",
      value: "illegal_fishing",
      display: "Illegal Fishing",
      category: "violation",
      defaultPriority: 300,
      isActive: true,
      syncedAt: now,
    },
    {
      erEventtypeId: "vessel_intrusion",
      value: "vessel_intrusion",
      display: "Vessel Intrusion",
      category: "security",
      defaultPriority: 200,
      isActive: true,
      syncedAt: now,
    },
    {
      erEventtypeId: "equipment_damage",
      value: "equipment_damage",
      display: "Equipment Damage",
      category: "maintenance",
      defaultPriority: 100,
      isActive: true,
      syncedAt: now,
    },
    {
      erEventtypeId: "sos_distress",
      value: "sos_distress",
      display: "SOS / Distress",
      category: "emergency",
      defaultPriority: 300,
      isActive: true,
      syncedAt: now,
    },
  ];

  const eventTypeIdByValue = new Map<string, string>();
  for (const et of eventTypes) {
    const row = await prisma.eventType.upsert({
      where: {
        tenantId_erEventtypeId: {
          tenantId: tenant.id,
          erEventtypeId: et.erEventtypeId,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...et,
      },
    });
    eventTypeIdByValue.set(et.value, row.id);
  }

  // NOTE: this seed deliberately creates NO demo PatrolArea.
  //
  // It used to find-or-create "Demo Patrol Zone Alpha" — a small square polygon
  // that rendered as a stray blue box on the live map. Real patrol areas are
  // operator-drawn or derived from uploaded boundaries, so a synthetic one is
  // not demo data, it is map noise that reappears on every seed run.
  //
  // PatrolSchedule.patrolAreaId is nullable (onDelete: SetNull), so the demo
  // schedules below are seeded unattached. Do not reintroduce a demo area here;
  // seed-no-demo-patrol-area.test.ts guards this.

  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  // ── A. Subjects (rangers) ──────────────────────────────────────────────────
  const rangerDefs = [
    { erSubjectId: "ranger-001", name: "Ranger Alpha" },
    { erSubjectId: "ranger-002", name: "Ranger Bravo" },
    { erSubjectId: "ranger-003", name: "Ranger Charlie" },
    { erSubjectId: "ranger-004", name: "Ranger Delta" },
    { erSubjectId: "ranger-005", name: "Ranger Echo" },
  ];

  const rangers = await Promise.all(
    rangerDefs.map((r) =>
      prisma.subject.upsert({
        where: { tenantId_erSubjectId: { tenantId: tenant.id, erSubjectId: r.erSubjectId } },
        update: {},
        create: {
          tenantId: tenant.id,
          erSubjectId: r.erSubjectId,
          name: r.name,
          subjectType: "ranger",
          isActive: true,
          syncedAt: now,
        },
      }),
    ),
  );

  // ── B. AreaBoundary ────────────────────────────────────────────────────────
  const existingNorth = await prisma.areaBoundary.findFirst({
    where: { tenantId: tenant.id, name: "North Reef Zone" },
  });
  const northBoundary = existingNorth ?? await prisma.areaBoundary.create({
    data: {
      tenantId: tenant.id,
      name: "North Reef Zone",
      aliases: [],
      region: "Oriental Mindoro",
      geometryType: "Polygon",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [[[121.24, 13.44], [121.27, 13.44], [121.27, 13.47], [121.24, 13.47], [121.24, 13.44]]],
      },
      createdByUserId: siteAdmin.id,
    },
  });

  const existingSouth = await prisma.areaBoundary.findFirst({
    where: { tenantId: tenant.id, name: "South Mangrove Zone" },
  });
  const southBoundary = existingSouth ?? await prisma.areaBoundary.create({
    data: {
      tenantId: tenant.id,
      name: "South Mangrove Zone",
      aliases: [],
      region: "Oriental Mindoro",
      geometryType: "Polygon",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [[[121.14, 13.29], [121.17, 13.29], [121.17, 13.32], [121.14, 13.32], [121.14, 13.29]]],
      },
      createdByUserId: siteAdmin.id,
    },
  });

  // ── C. Patrols ─────────────────────────────────────────────────────────────
  const p1s = daysAgo(7);
  const p2s = daysAgo(3);
  const p3s = new Date(now.getTime() - 2 * 3600000);
  type PatrolDef = { erPatrolId: string; title: string; patrolType: "foot" | "seaborne"; state: "open" | "done" | "cancelled"; startTime: Date; endTime: Date | null; totalDistanceKm: number | null; totalHours: number | null; boatName: string | null; areaName: string | null; areaBoundaryId: string | null };
  const patrolDefs: PatrolDef[] = [
    { erPatrolId: "patrol-001", title: "Morning Foot Patrol", patrolType: "foot", state: "done", startTime: p1s, endTime: new Date(p1s.getTime() + 4 * 3600000), totalDistanceKm: 8.5, totalHours: 4, boatName: null, areaName: "North Reef Zone", areaBoundaryId: northBoundary.id },
    { erPatrolId: "patrol-002", title: "Coastal Sweep", patrolType: "seaborne", state: "done", startTime: p2s, endTime: new Date(p2s.getTime() + 6 * 3600000), totalDistanceKm: 22.3, totalHours: 6, boatName: "MV Bantay 1", areaName: "South Mangrove Zone", areaBoundaryId: southBoundary.id },
    { erPatrolId: "patrol-003", title: "Active Surveillance", patrolType: "seaborne", state: "open", startTime: p3s, endTime: null, totalDistanceKm: null, totalHours: null, boatName: "MV Bantay 2", areaName: "North Reef Zone", areaBoundaryId: northBoundary.id },
    { erPatrolId: "patrol-004", title: "Cancelled Drill", patrolType: "foot", state: "cancelled", startTime: daysAgo(1), endTime: null, totalDistanceKm: null, totalHours: null, boatName: null, areaName: null, areaBoundaryId: null },
  ];

  for (const p of patrolDefs) {
    await prisma.patrol.upsert({
      where: { tenantId_erPatrolId: { tenantId: tenant.id, erPatrolId: p.erPatrolId } },
      update: {},
      create: {
        tenantId: tenant.id,
        erPatrolId: p.erPatrolId,
        title: p.title,
        patrolType: p.patrolType,
        state: p.state,
        startTime: p.startTime,
        endTime: p.endTime,
        totalDistanceKm: p.totalDistanceKm,
        totalHours: p.totalHours,
        boatName: p.boatName,
        areaName: p.areaName,
        areaBoundaryId: p.areaBoundaryId,
        syncedAt: now,
      },
    });
  }

  // ── D. PatrolSchedules ─────────────────────────────────────────────────────
  type Ranger = (typeof rangers)[number];
  const [rA, rB, rC, rD, rE] = rangers as [Ranger, Ranger, Ranger, Ranger, Ranger];
  const scheduleDefs = [
    { ranger: rA, start: daysAgo(5), end: new Date(daysAgo(5).getTime() + 8 * 3600000) },
    { ranger: rB, start: daysAgo(2), end: new Date(daysAgo(2).getTime() + 6 * 3600000) },
    { ranger: rC, start: now, end: new Date(now.getTime() + 4 * 3600000) },
    { ranger: rD, start: daysAgo(-2), end: new Date(daysAgo(-2).getTime() + 8 * 3600000) },
    { ranger: rE, start: daysAgo(-5), end: new Date(daysAgo(-5).getTime() + 6 * 3600000) },
  ];

  for (const s of scheduleDefs) {
    const existing = await prisma.patrolSchedule.findFirst({
      where: { tenantId: tenant.id, rangerName: s.ranger.name, scheduledStart: s.start },
    });
    if (!existing) {
      await prisma.patrolSchedule.create({
        data: {
          tenantId: tenant.id,
          patrolAreaId: null,
          rangerUserId: null,
          rangerName: s.ranger.name,
          scheduledStart: s.start,
          scheduledEnd: s.end,
          notes: null,
          createdBy: siteAdmin.id,
        },
      });
    }
  }

  // ── E. Events ──────────────────────────────────────────────────────────────
  type EventDef = { erEventId: string; title: string; serialNumber: string | null; priority: number; state: "new_event" | "active" | "resolved"; locationLat: number | null; locationLon: number | null; reportedByName: string | null; reportedAt: Date; areaName: string; areaBoundaryId: string; eventTypeValue: string };
  const eventDefs: EventDef[] = [
    // priority is constrained to 0-3 (schema/eventListFilters min(0).max(3)):
    // 3 = high/red, 2 = amber, 1 = low/green, 0 = gray. (Earlier seed data used
    // EarthRanger's raw 0/100/200/300 scale, which is out of range and was
    // rejected / mis-filtered by the events API.)
    { erEventId: "event-001", title: "Illegal Net Sighting", serialNumber: "ER-2026-001", priority: 3, state: "active", locationLat: 13.455, locationLon: 121.255, reportedByName: "Ranger Alpha", reportedAt: daysAgo(2), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "illegal_fishing" },
    { erEventId: "event-002", title: "Wildlife Sighting — Sea Turtle", serialNumber: null, priority: 1, state: "new_event", locationLat: 13.45, locationLon: 121.26, reportedByName: null, reportedAt: daysAgo(1), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "wildlife_sighting" },
    { erEventId: "event-003", title: "Vessel Intrusion", serialNumber: null, priority: 2, state: "active", locationLat: 13.305, locationLon: 121.155, reportedByName: "Ranger Charlie", reportedAt: daysAgo(0), areaName: "South Mangrove Zone", areaBoundaryId: southBoundary.id, eventTypeValue: "vessel_intrusion" },
    { erEventId: "event-004", title: "Equipment Damage Resolved", serialNumber: null, priority: 1, state: "resolved", locationLat: null, locationLon: null, reportedByName: null, reportedAt: daysAgo(10), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "equipment_damage" },
  ];

  for (const e of eventDefs) {
    await prisma.event.upsert({
      where: { tenantId_erEventId: { tenantId: tenant.id, erEventId: e.erEventId } },
      update: { eventTypeId: eventTypeIdByValue.get(e.eventTypeValue) ?? null },
      create: {
        tenantId: tenant.id,
        eventTypeId: eventTypeIdByValue.get(e.eventTypeValue) ?? null,
        erEventId: e.erEventId,
        title: e.title,
        serialNumber: e.serialNumber,
        priority: e.priority,
        state: e.state,
        locationLat: e.locationLat,
        locationLon: e.locationLon,
        reportedByName: e.reportedByName,
        reportedAt: e.reportedAt,
        areaName: e.areaName,
        areaBoundaryId: e.areaBoundaryId,
        syncedAt: now,
      },
    });
  }

  // ── F. Observations ────────────────────────────────────────────────────────
  for (let i = 1; i <= 5; i++) {
    await prisma.observation.upsert({
      where: { tenantId_erObservationId: { tenantId: tenant.id, erObservationId: `obs-00${i}` } },
      update: {},
      create: {
        tenantId: tenant.id,
        erObservationId: `obs-00${i}`,
        subjectId: rangers[(i - 1) % 5]!.id,
        locationLat: 13.45 + i * 0.005,
        locationLon: 121.25 + i * 0.005,
        recordedAt: daysAgo(i),
        sourceName: "GPS Tracker",
        syncedAt: now,
      },
    });
  }

  // ── G. FuelEntries ─────────────────────────────────────────────────────────
  const fuelDefs = [
    { areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, dateReceived: daysAgo(15), liters: 50, totalPrice: 3500, notes: "Refuel for week 1" },
    { areaName: "South Mangrove Zone", areaBoundaryId: southBoundary.id, dateReceived: daysAgo(10), liters: 75, totalPrice: 5250, notes: null },
    { areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, dateReceived: daysAgo(3), liters: 40, totalPrice: 2800, notes: null },
  ];

  for (const f of fuelDefs) {
    const existing = await prisma.fuelEntry.findFirst({
      where: { tenantId: tenant.id, areaName: f.areaName, dateReceived: f.dateReceived, liters: f.liters },
    });
    if (!existing) {
      await prisma.fuelEntry.create({
        data: {
          tenantId: tenant.id,
          areaName: f.areaName,
          areaBoundaryId: f.areaBoundaryId,
          dateReceived: f.dateReceived,
          liters: f.liters,
          totalPrice: f.totalPrice,
          currency: "PHP",
          notes: f.notes,
          loggedByUserId: siteAdmin.id,
        },
      });
    }
  }

  // ── H. AlertRules ──────────────────────────────────────────────────────────
  // Canonical condition schema: { minPriority?: number, eventTypeId?: string }
  // Priority scale = 0 / 100 / 200 / 300 (LOW / MEDIUM / HIGH / CRITICAL).
  // "High Priority Events" fires when event.priority >= 200 (HIGH or CRITICAL).
  // "Critical SOS Alerts" fires only for sos_distress event types.
  const sosEventTypeId = eventTypeIdByValue.get("sos_distress");
  const alertDefs = [
    {
      name: "High Priority Events",
      conditionJson: { minPriority: 200 } as Prisma.InputJsonValue,
      notificationChannels: ["in_app" as const],
      isActive: true,
    },
    {
      name: "Critical SOS Alerts",
      // eventTypeId is the Prisma row ID resolved from the event-type upsert above.
      conditionJson: sosEventTypeId !== undefined
        ? ({ eventTypeId: sosEventTypeId } as Prisma.InputJsonValue)
        : ({ minPriority: 300 } as Prisma.InputJsonValue),
      notificationChannels: ["in_app" as const, "email" as const],
      isActive: true,
    },
  ];

  for (const a of alertDefs) {
    const existing = await prisma.alertRule.findFirst({
      where: { tenantId: tenant.id, name: a.name },
    });
    if (!existing) {
      await prisma.alertRule.create({
        data: {
          tenantId: tenant.id,
          name: a.name,
          conditionJson: a.conditionJson,
          notificationChannels: a.notificationChannels,
          isActive: a.isActive,
          createdBy: siteAdmin.id,
        },
      });
    } else {
      // Reconcile stale condition_json to canonical shape on every seed run.
      // Necessary because the pre-V32.14 seed used legacy keys
      // ({"eventTypeValue":"sos_distress"}, {"priority":{"gte":200}}) that the
      // alert evaluator does not read. Idempotent — no-op when already canonical.
      await prisma.alertRule.update({
        where: { id: existing.id },
        data: { conditionJson: a.conditionJson },
      });
    }
  }

  // ── I. ReportExports ───────────────────────────────────────────────────────
  const reportDefs = [
    {
      reportType: "coverage" as const,
      paramsJson: { from: daysAgo(30).toISOString(), to: now.toISOString() },
      filePath: "demo/coverage-2026-05.pdf",
      fileSizeBytes: 245000,
      completedAt: daysAgo(1),
    },
    {
      reportType: "area" as const,
      paramsJson: { areaBoundaryId: northBoundary.id, month: "2026-05" },
      filePath: "demo/area-north-2026-05.pdf",
      fileSizeBytes: 198000,
      completedAt: daysAgo(2),
    },
  ];

  for (const r of reportDefs) {
    const existing = await prisma.reportExport.findFirst({
      where: { tenantId: tenant.id, reportType: r.reportType, filePath: r.filePath },
    });
    if (!existing) {
      await prisma.reportExport.create({
        data: {
          tenantId: tenant.id,
          requestedByUserId: siteAdmin.id,
          reportType: r.reportType,
          paramsJson: r.paramsJson,
          paperSize: "A4",
          status: "ready",
          filePath: r.filePath,
          fileSizeBytes: r.fileSizeBytes,
          completedAt: r.completedAt,
        },
      });
    }
  }

  // Seed municipalities + protected zones for all tenants.
  await seedMunicipalities(prisma);

  // Seed the CMS content models (DocPage/ShowcaseField) from the current
  // filesystem docs + showcase literals — docs/CMS_BUILD_PLAN.md W2.
  const cmsCounts = await seedCms(prisma);

  console.log("Seed complete:");
  console.log(`  Tenant:         ${tenant.name} (${tenant.id})`);
  console.log(`  Tenant Admin:   tenantadmin@powerbyteitsolutions.com (tenant_manager)`);
  console.log(`  Webmaster:      webmaster@localhost.com (tenant_superadmin)`);
  console.log(`  Admin:          admin@admin.com (tenant_admin)`);
  console.log(`  Event Types:    ${eventTypes.length}`);
  console.log(`  Patrol Area:    (none — demo patrol area intentionally not seeded)`);
  console.log(`  Subjects:       ${rangers.length}`);
  console.log(`  Area Boundaries: 2`);
  console.log(`  Patrols:        4`);
  console.log(`  Schedules:      5`);
  console.log(`  Events:         4`);
  console.log(`  Observations:   5`);
  console.log(`  Fuel Entries:   3`);
  console.log(`  Alert Rules:    2`);
  console.log(`  Report Exports: 2`);
  console.log(`  Municipalities: 11 + 1 protected zone (per tenant)`);
  console.log(`  CMS DocPages:   ${cmsCounts.docPages}`);
  console.log(`  CMS ShowcaseFields: ${cmsCounts.showcaseFields}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

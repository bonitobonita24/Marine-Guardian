import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
  const webmasterPassword = requireEnv("WEBMASTER_PASSWORD");
  const demoSiteAdminPassword = requireEnv("DEMO_SITE_ADMIN_PASSWORD");

  const webmasterHash = await bcrypt.hash(webmasterPassword, BCRYPT_ROUNDS);
  const demoSiteAdminHash = await bcrypt.hash(demoSiteAdminPassword, BCRYPT_ROUNDS);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-site" },
    update: {},
    create: {
      name: "Demo Site",
      slug: "demo-site",
      isActive: true,
      timezone: "Asia/Manila",
      syncFrequencySeconds: 300,
    },
  });

  await prisma.user.upsert({
    where: { email: "webmaster@marine-guardian.local" },
    update: { passwordHash: webmasterHash },
    create: {
      email: "webmaster@marine-guardian.local",
      passwordHash: webmasterHash,
      fullName: "Webmaster",
      role: "super_admin",
      isActive: true,
      tenantId: null,
    },
  });

  const siteAdmin = await prisma.user.upsert({
    where: { email: "admin@demo-site.local" },
    update: { passwordHash: demoSiteAdminHash },
    create: {
      email: "admin@demo-site.local",
      passwordHash: demoSiteAdminHash,
      fullName: "Demo Site Admin",
      role: "site_admin",
      isActive: true,
      tenantId: tenant.id,
    },
  });

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

  const existingArea = await prisma.patrolArea.findFirst({
    where: { tenantId: tenant.id, name: "Demo Patrol Zone Alpha" },
  });

  const patrolArea = existingArea ?? await prisma.patrolArea.create({
    data: {
      tenantId: tenant.id,
      name: "Demo Patrol Zone Alpha",
      patrolType: "seaborne",
      polygonGeojson: {
        type: "Polygon",
        coordinates: [
          [
            [120.95, 14.55],
            [120.98, 14.55],
            [120.98, 14.58],
            [120.95, 14.58],
            [120.95, 14.55],
          ],
        ],
      },
      colorHex: "#3B82F6",
      isActive: true,
      createdBy: siteAdmin.id,
    },
  });

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
      region: "Manila Bay",
      geometryType: "Polygon",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [[[120.95, 14.55], [120.98, 14.55], [120.98, 14.58], [120.95, 14.58], [120.95, 14.55]]],
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
      region: "Manila Bay",
      geometryType: "Polygon",
      geometryGeojson: {
        type: "Polygon",
        coordinates: [[[120.95, 14.50], [120.98, 14.50], [120.98, 14.53], [120.95, 14.53], [120.95, 14.50]]],
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
      where: { tenantId: tenant.id, patrolAreaId: patrolArea.id, rangerName: s.ranger.name, scheduledStart: s.start },
    });
    if (!existing) {
      await prisma.patrolSchedule.create({
        data: {
          tenantId: tenant.id,
          patrolAreaId: patrolArea.id,
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
    { erEventId: "event-001", title: "Illegal Net Sighting", serialNumber: "ER-2026-001", priority: 300, state: "active", locationLat: 14.567, locationLon: 120.965, reportedByName: "Ranger Alpha", reportedAt: daysAgo(2), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "illegal_fishing" },
    { erEventId: "event-002", title: "Wildlife Sighting — Sea Turtle", serialNumber: null, priority: 100, state: "new_event", locationLat: 14.55, locationLon: 120.96, reportedByName: null, reportedAt: daysAgo(1), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "wildlife_sighting" },
    { erEventId: "event-003", title: "Vessel Intrusion", serialNumber: null, priority: 200, state: "active", locationLat: 14.52, locationLon: 120.98, reportedByName: "Ranger Charlie", reportedAt: daysAgo(0), areaName: "South Mangrove Zone", areaBoundaryId: southBoundary.id, eventTypeValue: "vessel_intrusion" },
    { erEventId: "event-004", title: "Equipment Damage Resolved", serialNumber: null, priority: 100, state: "resolved", locationLat: null, locationLon: null, reportedByName: null, reportedAt: daysAgo(10), areaName: "North Reef Zone", areaBoundaryId: northBoundary.id, eventTypeValue: "equipment_damage" },
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
        locationLat: 14.55 + i * 0.005,
        locationLon: 120.96 + i * 0.005,
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
  const alertDefs = [
    {
      name: "High Priority Events",
      conditionJson: { priority: { gte: 200 } },
      notificationChannels: ["in_app" as const],
      isActive: true,
    },
    {
      name: "Critical SOS Alerts",
      conditionJson: { eventTypeValue: "sos_distress" },
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

  console.log("Seed complete:");
  console.log(`  Tenant:         ${tenant.name} (${tenant.id})`);
  console.log(`  Webmaster:      webmaster@marine-guardian.local (super_admin)`);
  console.log(`  Site Admin:     admin@demo-site.local (site_admin)`);
  console.log(`  Event Types:    ${eventTypes.length}`);
  console.log(`  Patrol Area:    ${patrolArea.name}`);
  console.log(`  Subjects:       ${rangers.length}`);
  console.log(`  Area Boundaries: 2`);
  console.log(`  Patrols:        4`);
  console.log(`  Schedules:      5`);
  console.log(`  Events:         4`);
  console.log(`  Observations:   5`);
  console.log(`  Fuel Entries:   3`);
  console.log(`  Alert Rules:    2`);
  console.log(`  Report Exports: 2`);
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

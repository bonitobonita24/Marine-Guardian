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

  for (const et of eventTypes) {
    await prisma.eventType.upsert({
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

  console.log("Seed complete:");
  console.log(`  Tenant:       ${tenant.name} (${tenant.id})`);
  console.log(`  Webmaster:    webmaster@marine-guardian.local (super_admin)`);
  console.log(`  Site Admin:   admin@demo-site.local (site_admin)`);
  console.log(`  Event Types:  ${eventTypes.length}`);
  console.log(`  Patrol Area:  ${patrolArea.name}`);
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

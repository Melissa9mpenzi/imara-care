import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the PostgreSQL database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const roleDefinitions = [
  {
    key: "admin",
    name: "Platform administrator",
    facilityScoped: false,
    requiresMfa: true,
    permissions: ["facility:create", "facility:manage", "support:approve", "health:read"],
  },
  {
    key: "facility_admin",
    name: "Facility administrator",
    facilityScoped: true,
    requiresMfa: true,
    permissions: [
      "facility:manage", "settings:manage", "user:manage", "role:manage", "audit:read",
      "patient:read", "patient:create", "patient:export", "appointment:read",
      "appointment:manage", "visit:checkin", "queue:manage", "triage:create",
      "billing:read", "billing:manage", "discount:apply_large", "report:export",
    ],
  },
  {
    key: "medical_director",
    name: "Medical director",
    facilityScoped: true,
    requiresMfa: true,
    permissions: [
      "patient:read", "patient:export", "appointment:read", "visit:read",
      "triage:create", "queue:manage", "prescription:create", "lab:read",
      "report:export", "break_glass:request",
    ],
  },
  {
    key: "clinician",
    name: "Doctor / clinician",
    facilityScoped: true,
    requiresMfa: true,
    permissions: [
      "patient:read", "appointment:read", "visit:read", "triage:create",
      "queue:manage", "prescription:create", "lab:read", "break_glass:request",
    ],
  },
  {
    key: "pharmacist",
    name: "Pharmacist",
    facilityScoped: true,
    requiresMfa: true,
    permissions: ["patient:read", "prescription:read", "prescription:dispense", "controlled_drug:dispense"],
  },
  {
    key: "nurse",
    name: "Nurse",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "visit:read", "triage:create", "queue:manage"],
  },
  {
    key: "reception",
    name: "Reception",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "patient:create", "appointment:read", "appointment:manage", "visit:checkin", "queue:manage"],
  },
  {
    key: "laboratory",
    name: "Laboratory",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "lab:read", "lab:result:update"],
  },
  {
    key: "pharmacy",
    name: "Pharmacy staff",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "prescription:read", "prescription:dispense"],
  },
  {
    key: "cashier",
    name: "Cashier",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "billing:read", "billing:collect"],
  },
  {
    key: "records",
    name: "Medical records",
    facilityScoped: true,
    requiresMfa: false,
    permissions: ["patient:read", "patient:export", "report:export"],
  },
];

const permissionDescriptions = new Map<string, string>([
  ["facility:create", "Create a facility."],
  ["facility:manage", "Manage facility profile and lifecycle."],
  ["settings:manage", "Change facility configuration."],
  ["user:manage", "Invite and manage facility staff."],
  ["role:manage", "Manage facility roles and permissions."],
  ["audit:read", "Read facility audit records."],
  ["patient:read", "Read permitted patient records."],
  ["patient:create", "Register a patient."],
  ["patient:export", "Export patient information."],
  ["appointment:read", "Read appointments."],
  ["appointment:manage", "Create and manage appointments."],
  ["visit:read", "Read visit records."],
  ["visit:checkin", "Check patients in for visits."],
  ["queue:manage", "Manage department queues."],
  ["triage:create", "Record patient triage."],
  ["prescription:create", "Create prescriptions."],
  ["prescription:read", "Read prescriptions."],
  ["prescription:dispense", "Dispense prescribed medicines."],
  ["controlled_drug:dispense", "Dispense controlled medicines."],
  ["lab:read", "Read laboratory requests and results."],
  ["lab:result:update", "Enter or update laboratory results."],
  ["billing:read", "Read billing records."],
  ["billing:manage", "Manage facility billing settings."],
  ["billing:collect", "Record patient payments."],
  ["discount:apply_large", "Approve discounts above the standard threshold."],
  ["report:export", "Export permitted operational reports."],
  ["break_glass:request", "Request audited emergency access."],
  ["support:approve", "Approve time-limited platform support access."],
  ["health:read", "Read non-clinical facility health status."],
]);

async function seedFacility() {
  const code = process.env.IMARA_FACILITY_ID ?? "IM";
  const slug = process.env.IMARA_FACILITY_SLUG ?? "imara-care";
  const name = process.env.IMARA_FACILITY_NAME ?? "Imara Care Clinic";

  return prisma.facility.upsert({
    where: { slug },
    update: { name, code },
    create: {
      name,
      slug,
      code,
      status: "active",
      currency: "UGX",
      timezone: "Africa/Kampala",
      settings: {
        allowedStaffLoginMethods: ["password"],
        facebookStaffEnabled: false,
        sharedTerminalIdleMinutes: 5,
        idleTimeoutMinutes: 15,
        sessionAbsoluteHours: 12,
      },
    },
  });
}

async function seedPermissions() {
  for (const [code, description] of permissionDescriptions) {
    await prisma.permission.upsert({
      where: { code },
      update: { description },
      create: { code, description },
    });
  }
}

async function seedRoles(facilityCode: string) {
  for (const definition of roleDefinitions) {
    const facilityId = definition.facilityScoped ? facilityCode : null;
    const existing = await prisma.role.findFirst({
      where: { facilityId, key: definition.key },
      select: { id: true },
    });
    if (existing) {
      await prisma.role.update({
        where: { id: existing.id },
        data: {
          name: definition.name,
          isSystem: true,
          requiresMfa: definition.requiresMfa,
        },
      });
      continue;
    }

    const role = await prisma.role.create({
      data: {
        facilityId,
        key: definition.key,
        name: definition.name,
        isSystem: true,
        requiresMfa: definition.requiresMfa,
      },
    });
    await prisma.rolePermission.createMany({
      data: definition.permissions.map((permissionCode) => ({
        roleId: role.id,
        permissionCode,
      })),
    });
  }
}

try {
  const facility = await seedFacility();
  await seedPermissions();
  await seedRoles(facility.code);
  console.log(`Seeded facility ${facility.slug} and ${roleDefinitions.length} system roles.`);
} finally {
  await prisma.$disconnect();
}

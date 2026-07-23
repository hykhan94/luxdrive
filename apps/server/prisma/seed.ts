import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // Hash password using Better Auth's method
  const { hashPassword } = await import("better-auth/crypto");

  // Create Users with different roles
  const users = [
    {
      email: "customer@luxdrive.sa",
      password: "customer123",
      name: "Ahmed Customer",
      firstName: "Ahmed",
      lastName: "Customer",
      phone: "+966501234567",
      role: "CUSTOMER" as const,
    },
    {
      email: "sales@luxdrive.sa",
      password: "sales123",
      name: "Fahad Sales",
      firstName: "Fahad",
      lastName: "Sales",
      phone: "+966502234567",
      role: "SALES" as const,
      department: "SALES" as const,
      position: "EXECUTIVE" as const,
    },
    {
      email: "ops@luxdrive.sa",
      password: "ops123",
      name: "Omar Operations",
      firstName: "Omar",
      lastName: "Operations",
      phone: "+966503234567",
      role: "OPERATIONS" as const,
      department: "OPERATIONS" as const,
      position: "EXECUTIVE" as const,
    },
    {
      email: "admin@luxdrive.sa",
      password: "admin123",
      name: "Sultan Admin",
      firstName: "Sultan",
      lastName: "Admin",
      phone: "+966504234567",
      role: "ADMIN" as const,
    },
    {
      email: "partner@acmecorp.sa",
      password: "partner123",
      name: "Khalid Partner",
      firstName: "Khalid",
      lastName: "Partner",
      phone: "+966505234567",
      role: "PARTNER" as const,
    },
    {
      email: "vendor@saudilimo.sa",
      password: "vendor123",
      name: "Mohammed Vendor",
      firstName: "Mohammed",
      lastName: "Vendor",
      phone: "+966506234567",
      role: "VENDOR" as const,
    },
  ];

  for (const userData of users) {
    const { password, department, position, ...rest } = userData;
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {},
      create: {
        email: rest.email,
        name: rest.name,
        firstName: rest.firstName,
        lastName: rest.lastName,
        phone: rest.phone,
        role: rest.role,
        department: department || null,
        position: position || null,
        emailVerified: true,
      },
    });

    // Create account with password (Better Auth stores password here)
    await prisma.account.upsert({
      where: {
        providerId_accountId: {
          providerId: "credential",
          accountId: user.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hashedPassword,
      },
    });

    console.log(`✅ Created user: ${user.email} (${user.role})`);

    // Create Partner profile
    if (userData.role === "PARTNER") {
      await prisma.partner.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          companyName: "ACME Corporation",
          crNumber: "1234567890",
          vatNumber: "300123456789",
          creditLimit: 50000,
          status: "APPROVED",
        },
      });
      console.log(`   └─ Created partner profile: ACME Corporation`);
    }

    // Create Vendor profile
    if (userData.role === "VENDOR") {
      const vendor = await prisma.vendor.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          companyName: "Saudi Limo Services",
          crNumber: "0987654321",
          vatNumber: "300987654321",
          status: "APPROVED",
          rating: 4.8,
        },
      });
      console.log(`   └─ Created vendor profile: Saudi Limo Services`);

      // Check if vehicle already exists
      const existingVehicle = await prisma.vehicle.findFirst({
        where: { vendorId: vendor.id, plateNumber: "ABC 1234" },
      });

      if (!existingVehicle) {
        const vehicle = await prisma.vehicle.create({
          data: {
            vendorId: vendor.id,
            category: "BUSINESS_SEDAN",
            make: "Mercedes-Benz",
            model: "E-Class",
            year: 2024,
            plateNumber: "ABC 1234",
            color: "Black",
            seats: 4,
            features: ["WiFi", "Water", "Phone Charger"],
          },
        });
        console.log(`   └─ Created vehicle: ${vehicle.make} ${vehicle.model}`);

        // Add sample driver. Stage 2 schema moved identity/license docs
        // off the Driver model — those now live as separate DriverDocument
        // rows (so admin can review, expire, and re-request each one
        // independently). Bare Driver creation here is sufficient for
        // seed; vendor portal would upload the docs as part of the
        // driver-add flow in real use.
        const driver = await prisma.driver.create({
          data: {
            vendorId: vendor.id,
            assignedVehicleId: vehicle.id,
            firstName: "Abdullah",
            lastName: "Driver",
            phone: "+966507234567",
            rating: 4.9,
          },
        });
        console.log(
          `   └─ Created driver: ${driver.firstName} ${driver.lastName}`,
        );
      } else {
        console.log(
          `   └─ Vehicle already exists: ${existingVehicle.make} ${existingVehicle.model}`,
        );
      }
    }
  }

  console.log("\n🎉 Seeding complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

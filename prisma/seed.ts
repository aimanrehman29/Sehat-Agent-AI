/**
 * Seed script for the DrugRegistry table.
 * Populates the database with sample DRAP-approved drugs for Pharma-Check AI.
 *
 * Run with: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Sample DRAP Drug Registry Data ─────────────────────────────────────────

const DRUG_SEED_DATA = [
  {
    registrationNo: "DRAP-0001-1234",
    drugName: "Panadol",
    genericName: "Paracetamol",
    manufacturer: "GlaxoSmithKline Pakistan",
    batchNumbers: ["PN-2024-001", "PN-2024-002", "PN-2025-001"],
    expiryDates: ["2026-06-30", "2026-12-31", "2027-06-30"],
    category: "Analgesic",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567890",
    qrData: "DRAP-0001-1234|Panadol|GSK",
  },
  {
    registrationNo: "DRAP-0002-5678",
    drugName: "Augmentin 625mg",
    genericName: "Amoxicillin + Clavulanic Acid",
    manufacturer: "GlaxoSmithKline Pakistan",
    batchNumbers: ["AG-2024-101", "AG-2024-102"],
    expiryDates: ["2026-03-31", "2026-09-30"],
    category: "Antibiotic",
    schedule: "Schedule-H",
    isActive: true,
    barcodeData: "8901234567891",
    qrData: "DRAP-0002-5678|Augmentin|GSK",
  },
  {
    registrationNo: "DRAP-0003-9012",
    drugName: "Brufen 400mg",
    genericName: "Ibuprofen",
    manufacturer: "Abbott Laboratories Pakistan",
    batchNumbers: ["BF-2024-201", "BF-2025-201"],
    expiryDates: ["2026-08-31", "2027-02-28"],
    category: "NSAID",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567892",
    qrData: "DRAP-0003-9012|Brufen|Abbott",
  },
  {
    registrationNo: "DRAP-0004-3456",
    drugName: "Glucophage 500mg",
    genericName: "Metformin",
    manufacturer: "Merck Pakistan",
    batchNumbers: ["GM-2024-301"],
    expiryDates: ["2026-12-31"],
    category: "Antidiabetic",
    schedule: "Schedule-H",
    isActive: true,
    barcodeData: "8901234567893",
    qrData: "DRAP-0004-3456|Glucophage|Merck",
  },
  {
    registrationNo: "DRAP-0005-7890",
    drugName: "Zyrtec 10mg",
    genericName: "Cetirizine",
    manufacturer: "GlaxoSmithKline Pakistan",
    batchNumbers: ["ZT-2024-401", "ZT-2025-401"],
    expiryDates: ["2026-06-30", "2027-06-30"],
    category: "Antihistamine",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567894",
    qrData: "DRAP-0005-7890|Zyrtec|GSK",
  },
  {
    registrationNo: "DRAP-0006-2345",
    drugName: "Capoten 25mg",
    genericName: "Captopril",
    manufacturer: "Bristol-Myers Squibb Pakistan",
    batchNumbers: ["CP-2024-501"],
    expiryDates: ["2026-04-30"],
    category: "ACE Inhibitor",
    schedule: "Schedule-H",
    isActive: true,
    barcodeData: "8901234567895",
    qrData: "DRAP-0006-2345|Capoten|BMS",
  },
  {
    registrationNo: "DRAP-0007-6789",
    drugName: "Risek 20mg",
    genericName: "Omeprazole",
    manufacturer: "Getz Pharma Pakistan",
    batchNumbers: ["RK-2024-601", "RK-2024-602"],
    expiryDates: ["2026-10-31", "2027-04-30"],
    category: "Proton Pump Inhibitor",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567896",
    qrData: "DRAP-0007-6789|Risek|Getz",
  },
  {
    registrationNo: "DRAP-0008-0123",
    drugName: "Calpol Suspension",
    genericName: "Paracetamol (Pediatric)",
    manufacturer: "GlaxoSmithKline Pakistan",
    batchNumbers: ["CS-2024-701"],
    expiryDates: ["2026-08-31"],
    category: "Analgesic (Pediatric)",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567897",
    qrData: "DRAP-0008-0123|Calpol|GSK",
  },
  {
    registrationNo: "DRAP-0009-4567",
    drugName: "Amodis 500mg",
    genericName: "Metronidazole",
    manufacturer: "Searle Pakistan",
    batchNumbers: ["AD-2024-801"],
    expiryDates: ["2026-06-30"],
    category: "Antibiotic / Antiprotozoal",
    schedule: "Schedule-H",
    isActive: true,
    barcodeData: "8901234567898",
    qrData: "DRAP-0009-4567|Amodis|Searle",
  },
  {
    registrationNo: "DRAP-0010-8901",
    drugName: "Loprin 75mg",
    genericName: "Aspirin (Low Dose)",
    manufacturer: "Sami Pharmaceuticals Pakistan",
    batchNumbers: ["LP-2024-901", "LP-2025-901"],
    expiryDates: ["2026-12-31", "2027-06-30"],
    category: "Antiplatelet",
    schedule: "OTC",
    isActive: true,
    barcodeData: "8901234567899",
    qrData: "DRAP-0010-8901|Loprin|Sami",
  },
];

// ─── Seed Execution ─────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding DrugRegistry...\n");

  let created = 0;
  let skipped = 0;

  for (const drug of DRUG_SEED_DATA) {
    const existing = await prisma.drugRegistry.findUnique({
      where: { registrationNo: drug.registrationNo },
    });

    if (existing) {
      console.log(`  ⏭  Skipped (already exists): ${drug.drugName} [${drug.registrationNo}]`);
      skipped++;
      continue;
    }

    await prisma.drugRegistry.create({ data: drug });
    console.log(`  ✅ Created: ${drug.drugName} [${drug.registrationNo}]`);
    created++;
  }

  console.log(`\n🎉 Seed complete: ${created} created, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

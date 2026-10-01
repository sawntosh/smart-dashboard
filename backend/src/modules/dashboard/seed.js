// Development helper: loads the frontend's sample data into MongoDB so the
// dashboard has something to show before the services API is finished.
//
//   npm run seed            insert sample data (refuses if data already exists)
//   npm run seed -- --reset delete existing services + categories first
//
// Writes to the same "services" / "categories" collections the services module
// uses, with real ObjectIds, so the records also work with Mongoose models.
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";
import { connectDB } from "../../config/db.js";
import { COLLECTIONS } from "./dashboard.repository.js";

const SAMPLE_FILE = new URL("../../../../frontend/src/data/services.json", import.meta.url);

// Same default categories as frontend/src/services/settingsService.js.
const SAMPLE_CATEGORIES = [
  { key: "cat_web", name: "Web Development", color: "#aa3bff" },
  { key: "cat_design", name: "Design", color: "#3b82f6" },
  { key: "cat_consulting", name: "Consulting", color: "#16a34a" },
  { key: "cat_support", name: "Support", color: "#d97706" },
];

async function seed({ reset }) {
  const db = mongoose.connection.db;
  const services = db.collection(COLLECTIONS.services);
  const categories = db.collection(COLLECTIONS.categories);

  const existing = (await services.countDocuments()) + (await categories.countDocuments());
  if (existing > 0 && !reset) {
    console.log(`Database already has ${existing} service/category records. Run "npm run seed -- --reset" to replace them.`);
    return;
  }
  if (reset) {
    await Promise.all([services.deleteMany({}), categories.deleteMany({})]);
  }

  const now = new Date();
  const categoryIds = new Map();
  const categoryDocs = SAMPLE_CATEGORIES.map(({ key, name, color }) => {
    const _id = new mongoose.Types.ObjectId();
    categoryIds.set(key, _id);
    return { _id, name, color, createdAt: now, updatedAt: now };
  });

  const sample = JSON.parse(await readFile(SAMPLE_FILE, "utf8"));
  const serviceDocs = sample.map((s) => ({
    name: s.name,
    category: categoryIds.get(s.category) ?? null,
    cost: Number(s.cost),
    billingCycle: s.billingCycle,
    renewalDate: new Date(s.renewalDate),
    status: s.status,
    notes: s.notes ?? "",
    createdAt: s.createdAt ? new Date(s.createdAt) : now,
    updatedAt: s.updatedAt ? new Date(s.updatedAt) : now,
  }));

  await categories.insertMany(categoryDocs);
  await services.insertMany(serviceDocs);
  console.log(`Seeded ${categoryDocs.length} categories and ${serviceDocs.length} services.`);
}

try {
  await connectDB();
  await seed({ reset: process.argv.includes("--reset") });
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

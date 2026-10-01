// Reads the data the dashboard needs straight from the MongoDB collections.
//
// The Service and Category models belong to the services module (Member 2).
// Reading the collections directly keeps this module free of imports from
// another member's files, so either side can change its code without breaking
// the other. The only contract is the collection names and the field names of
// the agreed service shape. Mongoose stores the `Service` model in "services"
// and the `Category` model in "categories".
import mongoose from "mongoose";

export const COLLECTIONS = { services: "services", categories: "categories" };

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function normalizeService(doc) {
  return {
    id: String(doc._id ?? doc.id),
    name: String(doc.name ?? ""),
    category: doc.category == null ? null : String(doc.category),
    cost: Number(doc.cost) || 0,
    billingCycle: doc.billingCycle,
    renewalDate: doc.renewalDate,
    status: doc.status,
  };
}

function normalizeCategory(doc) {
  return {
    id: String(doc._id ?? doc.id),
    name: String(doc.name ?? ""),
    color: doc.color || "#8b8b8b",
  };
}

/**
 * Services and categories visible to the current user. Once auth is in place
 * (Member 1's requireAuth sets req.user) records are limited to that owner;
 * until then every record is returned.
 */
export async function getDashboardData(user) {
  if (mongoose.connection.readyState !== 1) {
    throw httpError(503, "Database not connected. Check MONGODB_URI in backend/.env.");
  }

  const db = mongoose.connection.db;
  const ownerId = user?._id ?? user?.id;
  const filter = ownerId ? { owner: ownerId } : {};
  const projection = { name: 1, category: 1, cost: 1, billingCycle: 1, renewalDate: 1, status: 1, color: 1 };

  const [services, categories] = await Promise.all([
    db.collection(COLLECTIONS.services).find(filter, { projection }).toArray(),
    db.collection(COLLECTIONS.categories).find(filter, { projection }).toArray(),
  ]);

  return {
    services: services.map(normalizeService),
    categories: categories.map(normalizeCategory),
  };
}

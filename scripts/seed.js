import { getDb } from "../db.js";

const db = await getDb();
const col = db.collection("test_pagination_sham2");
await col.deleteMany({});

// Seed with repeated prices to prove tuple tie-break (price,_id) works
const docs = [];
for (let i = 1; i <= 250; i++) {
  const category = i % 2 ? "electronics" : "books";
  const price = (i % 10) * 5; // many duplicates: 0,5,10,...45
  const inStock = i % 3 === 0;

  docs.push({
    name: "Product " + i,
    category,
    price,
    inStock
  });
}

await col.insertMany(docs);
await col.createIndex({ category: 1, price: 1, _id: 1 });
await col.createIndex({ price: 1, _id: 1 });

console.log("✅ Seeded test_pagination_sham2 with duplicate prices");
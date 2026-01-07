import { getDb } from "../db.js";

const db = await getDb();
const col = db.collection("test_pagination");
await col.deleteMany({});

const docs = [];
for (let i = 0; i < 100; i++) {
  docs.push({
    name: "Product " + i,
    category: i % 2 ? "electronics" : "books",
    price: Math.random() * 100,
    inStock: i % 3 === 0
  });
}
await col.insertMany(docs);
console.log("Seeded");
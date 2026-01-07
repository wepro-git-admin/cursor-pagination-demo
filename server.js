import express from "express";
import dotenv from "dotenv";
import { getDb } from "./db.js";
import { CONFIG } from "./config.js";
import { encodeCursor, decodeCursor } from "./cursor.js";

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.static("public"));

app.get("/api/products", async (req, res) => {
  const db = await getDb();
  const col = db.collection("test_pagination");

  const pageSize = CONFIG.PAGE_SIZE;
  const direction = req.query.direction || "next";
  let filter = {};

  if (!req.query.cursor) {
    if (req.query.category) filter.category = req.query.category;
    if (req.query.priceGt) filter.price = { $gt: Number(req.query.priceGt) };
  }

  let cursorObj = req.query.cursor ? decodeCursor(req.query.cursor) : null;
  if (cursorObj?.anchor) {
    filter._id = direction === "next"
      ? { $gt: cursorObj.anchor.id }
      : { $lt: cursorObj.anchor.id };
  }

  const docs = await col.find(filter)
    .sort({ _id: 1 })
    .limit(pageSize + 1)
    .toArray();

  const hasMore = docs.length > pageSize;
  const items = hasMore ? docs.slice(0, pageSize) : docs;

  res.json({
    items,
    hasNext: hasMore,
    nextCursor: items.length
      ? encodeCursor({ anchor: { id: items[items.length - 1]._id.toString() } })
      : null
  });
});

app.listen(process.env.PORT || 3000);
import express from "express";
import dotenv from "dotenv";
import { getDb } from "./db.js";
import { CONFIG } from "./config.js";
import { encodeCursor, decodeCursor } from "./cursor.js";

dotenv.config();

const app = express();
app.disable("etag");
app.use(express.json());
app.use(express.static("public"));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const COLLECTION = "test_pagination_sham2";
const ALLOWED_SORT_FIELDS = new Set(["_id", "price"]);

function parseSort(req, cursorObj) {
  const sortField = cursorObj?.sort?.field || String(req.query.sortField || "_id");
  const sortDir = (cursorObj?.sort?.dir || String(req.query.sortDir || "asc")).toLowerCase();
  const field = ALLOWED_SORT_FIELDS.has(sortField) ? sortField : "_id";
  const dir = sortDir === "desc" ? "desc" : "asc";
  return { field, dir };
}

function buildFilter(req, cursorObj) {
  if (cursorObj?.filter) return cursorObj.filter;

  const filter = {};
  if (req.query.category) filter.category = String(req.query.category);

  if (req.query.priceOp && req.query.priceValue !== undefined && req.query.priceValue !== "") {
    const map = { gt: "$gt", gte: "$gte", lt: "$lt", lte: "$lte" };
    const op = map[String(req.query.priceOp)];
    if (op) filter.price = { [op]: Number(req.query.priceValue) };
  }
  return filter;
}

/**
 * Canonical ordering uses sort.dir (asc/desc) plus _id tie-breaker.
 * For prev requests we invert sort when fetching, then reverse results for display.
 */
function buildSortSpec(sortField, sortDir, direction) {
  const dir = sortDir === "desc" ? -1 : 1;
  const effectiveDir = direction === "prev" ? -dir : dir;
  if (sortField === "_id") return { _id: effectiveDir };
  return { [sortField]: effectiveDir, _id: effectiveDir };
}

/**
 * Build tuple condition relative to anchor for a given "compare".
 * If wantAfter=true: condition for records AFTER anchor in canonical order.
 * If wantAfter=false: condition for records BEFORE anchor in canonical order.
 */
function buildRelativeCondition(sortField, sortDir, anchor, wantAfter) {
  if (!anchor?.id) return {};

  // In canonical order:
  // - If asc: after means greater, before means less
  // - If desc: after means less, before means greater
  const canonicalDir = sortDir === "desc" ? -1 : 1;
  const op = (() => {
    if (wantAfter) return canonicalDir === 1 ? "$gt" : "$lt";
    return canonicalDir === 1 ? "$lt" : "$gt";
  })();

  if (sortField === "_id") {
    return { _id: { [op]: anchor.id } };
  }

  return {
    $or: [
      { [sortField]: { [op]: anchor.sortValue } },
      { [sortField]: anchor.sortValue, _id: { [op]: anchor.id } }
    ]
  };
}

/**
 * For paging query we need condition based on requested direction.
 * direction=next => wantAfter=true
 * direction=prev => wantAfter=false, but since we also invert sort to fetch backwards,
 * we can still use wantAfter=false on canonical order and invert sort for scan efficiency.
 */
function buildPagingCondition(sortField, sortDir, direction, anchor) {
  const wantAfter = direction === "next";
  return buildRelativeCondition(sortField, sortDir, anchor, wantAfter);
}

function makeAnchor(sortField, doc) {
  return {
    sortValue: sortField === "_id" ? undefined : doc[sortField],
    id: doc._id.toString()
  };
}

async function existsInDirection(col, filter, sort, anchor, wantAfter) {
  if (!anchor?.id) return False;
  const cond = buildRelativeCondition(sort.field, sort.dir, anchor, wantAfter);
  const query = Object.keys(cond).length ? { $and: [filter, cond] } : filter;
  const one = await col.find(query).limit(1).project({ _id: 1 }).toArray();
  return one.length > 0;
}

app.get("/api/products", async (req, res) => {
  const db = await getDb();
  const col = db.collection(COLLECTION);

  const requestedSize = req.query.pageSize ? Number(req.query.pageSize) : CONFIG.PAGE_SIZE;
  const pageSize = Math.min(
    Math.max(1, Number.isFinite(requestedSize) ? requestedSize : CONFIG.PAGE_SIZE),
    CONFIG.MAX_PAGE_SIZE
  );

  const direction = req.query.direction === "prev" ? "prev" : "next";
  const cursorObj = req.query.cursor ? decodeCursor(String(req.query.cursor)) : null;

  const sort = parseSort(req, cursorObj);
  const filter = buildFilter(req, cursorObj);

  const cursorCond = cursorObj?.anchor
    ? buildPagingCondition(sort.field, sort.dir, direction, cursorObj.anchor)
    : {};

  const query = Object.keys(cursorCond).length ? { $and: [filter, cursorCond] } : filter;
  const sortSpec = buildSortSpec(sort.field, sort.dir, direction);

  // Fetch pageSize + 1 to detect more in the FETCHED direction
  const docs = await col.find(query).sort(sortSpec).limit(pageSize + 1).toArray();
  const hasMoreFetchedDirection = docs.length > pageSize;
  const sliced = hasMoreFetchedDirection ? docs.slice(0, pageSize) : docs;
  const items = direction === "prev" ? sliced.reverse() : sliced;

  const first = items[0];
  const last = items[items.length - 1];

  // Determine true boundaries by existence checks around returned page.
  // hasPrevious: any doc BEFORE first in canonical order
  // hasNext: any doc AFTER last in canonical order
  let hasPrevious = false;
  let hasNext = false;

  if (items.length > 0) {
    // Check previous boundary
    const prevAnchor = { id: first._id, sortValue: sort.field === "_id" ? undefined : first[sort.field] };
    const prevCond = buildRelativeCondition(sort.field, sort.dir, prevAnchor, false);
    const prevQuery = Object.keys(prevCond).length ? { $and: [filter, prevCond] } : filter;
    hasPrevious = (await col.find(prevQuery).limit(1).project({ _id: 1 }).toArray()).length > 0;

    // Check next boundary
    const nextAnchor = { id: last._id, sortValue: sort.field === "_id" ? undefined : last[sort.field] };
    const nextCond = buildRelativeCondition(sort.field, sort.dir, nextAnchor, true);
    const nextQuery = Object.keys(nextCond).length ? { $and: [filter, nextCond] } : filter;
    hasNext = (await col.find(nextQuery).limit(1).project({ _id: 1 }).toArray()).length > 0;
  } else {
    // No items: we're beyond boundary in a direction => both false
    hasPrevious = false;
    hasNext = false;
  }

  // Only return cursors when navigation in that direction actually exists
  const nextCursor = (hasNext && last)
    ? encodeCursor({ filter, sort, anchor: makeAnchor(sort.field, last) })
    : null;

  const previousCursor = (hasPrevious && first)
    ? encodeCursor({ filter, sort, anchor: makeAnchor(sort.field, first) })
    : null;

  res.json({
    pageSize,
    direction,
    sort,
    filter,
    items,
    hasNext,
    hasPrevious,
    nextCursor,
    previousCursor
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`✅ Server running on http://localhost:${process.env.PORT || 3000}`);
});
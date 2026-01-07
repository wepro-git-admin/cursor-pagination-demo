let cursor = null;
async function next() {
  const url = cursor ? `/api/products?cursor=${cursor}` : "/api/products";
  const r = await fetch(url);
  const d = await r.json();
  cursor = d.nextCursor;
  document.getElementById("out").textContent =
    JSON.stringify(d.items, null, 2);
}
next();
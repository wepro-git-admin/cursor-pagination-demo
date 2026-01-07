let state = { nextCursor: null, previousCursor: null };
const q = (id) => document.getElementById(id);

function buildQuery() {
  const p = new URLSearchParams();

  const category = q("category").value.trim();
  if (category) p.set("category", category);

  const priceOp = q("priceOp").value;
  const priceValue = q("priceValue").value.trim();
  if (priceOp && priceValue !== "") {
    p.set("priceOp", priceOp);
    p.set("priceValue", priceValue);
  }

  p.set("sortField", q("sortField").value);
  p.set("sortDir", q("sortDir").value);
  p.set("direction", "next");
  return p;
}

function setNavVisibility(hasPrevious, hasNext) {
  q("prev").style.display = hasPrevious ? "inline-block" : "none";
  q("next").style.display = hasNext ? "inline-block" : "none";
}

async function load({ direction, cursor, newSearch }) {
  let url;
  if (newSearch || !cursor) {
    const p = buildQuery();
    p.set("direction", direction);
    url = "/api/products?" + p.toString();
  } else {
    url = "/api/products?direction=" + direction + "&cursor=" + encodeURIComponent(cursor);
  }

  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();

  state.nextCursor = d.nextCursor;
  state.previousCursor = d.previousCursor;

  // Hide/show buttons per requirement
  setNavVisibility(d.hasPrevious, d.hasNext);

  q("flags").textContent = ` hasPrev=${d.hasPrevious} hasNext=${d.hasNext} items=${d.items.length}`;
  q("out").textContent = JSON.stringify(d, null, 2);
}

q("search").onclick = () => load({ direction: "next", cursor: null, newSearch: true });

q("next").onclick = () => {
  if (!state.nextCursor) return;
  load({ direction: "next", cursor: state.nextCursor, newSearch: false });
};

q("prev").onclick = () => {
  if (!state.previousCursor) return;
  load({ direction: "prev", cursor: state.previousCursor, newSearch: false });
};

load({ direction: "next", cursor: null, newSearch: true });
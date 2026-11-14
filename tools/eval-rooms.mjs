#!/usr/bin/env node
// Scores how good hey jenna's picks and layouts are for some rooms, so changes can be compared.
//   node tools/eval-rooms.mjs <roomId> [roomId…]      (API must be running; AUTH_MODE=dev)
// For each room: fresh product search → layout → numbers that matter to a designer.
const API = process.env.API_URL ?? 'http://localhost:3000';
const ODD = /\b(children|kids?|junior|baby|gaming|outdoor|cover|storage boxes)\b/i;
const post = async (p, body) => (await fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })).json();
const get = async (p) => (await fetch(API + p)).json();

const rows = [];
for (const id of process.argv.slice(2)) {
  const room = await get(`/rooms/${id}`);
  const t0 = Date.now();
  const search = await post(`/rooms/${id}/listings/search`, { perType: 4 });
  const t1 = Date.now();
  const layout = await post(`/rooms/${id}/layouts`);
  const t2 = Date.now();
  if (!layout.objects) { console.log(id, 'layout failed', layout); continue; }
  const listings = await get(`/rooms/${id}/listings`);
  const byId = new Map(listings.map((l) => [l.id, l]));
  const placed = layout.objects.filter((o) => o.product);
  const obj = (t) => layout.objects.find((o) => o.type === t);
  const sofa = obj('sofa'), table = obj('coffee_table'), rug = obj('rug');
  const colour = placed.map((o) => byId.get(o.product.listingId)?.scoreDetail?.colour).filter((v) => v != null);
  rows.push({
    room: room.name,
    rules: `${layout.summary.pass}/${layout.summary.warn}/${layout.summary.fail}`,
    dropped: layout.dropped.length,
    placed: placed.length,
    models: placed.filter((o) => o.product.modelUrl).length,
    missing: layout.shoppingList.missing.join(", ") || "-",
    odd: placed.filter((o) => ODD.test(o.product.title)).map((o) => o.product.title.split(',')[0]).join('; ') || '-',
    colour: colour.length ? (colour.reduce((a, b) => a + b, 0) / colour.length).toFixed(2) : '-',
    'table/sofa': sofa && table ? (table.size.w / sofa.size.w).toFixed(2) : '-',
    'rug-sofa (m)': sofa && rug ? (rug.size.w - sofa.size.w).toFixed(2) : '-',
    variant: JSON.stringify(layout.variant ?? {}),
    price: layout.shoppingList.total,
    secs: `${((t1 - t0) / 1000).toFixed(0)}+${((t2 - t1) / 1000).toFixed(0)}`,
  });
  console.error(`${room.name}: ${search.listings?.length ?? 0} listings; search errors: ${(search.errors ?? []).join(" | ") || "none"}; fails: ${layout.checks.filter((c) => c.status === 'fail').map((c) => c.detail).join(' | ') || 'none'}; dropped: ${layout.dropped.map((d) => d.id).join(', ') || 'none'}`);
}
console.table(rows);

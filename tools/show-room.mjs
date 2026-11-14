#!/usr/bin/env node
// Shows what a room's latest layout would have you buy for the seating group, with links.
//   node tools/show-room.mjs <roomId>        (API running, AUTH_MODE=dev)
const API = process.env.API_URL ?? 'http://localhost:3000';
const room = process.argv[2];
const layouts = await (await fetch(`${API}/rooms/${room}/layouts`)).json();
const layout = layouts[0];
if (!layout) {
  console.log('no layout yet');
  process.exit(1);
}
for (const type of ['sofa', 'armchair', 'coffee_table', 'rug', 'side_table']) {
  for (const o of layout.objects.filter((x) => x.type === type)) {
    if (!o.product) {
      console.log(type.padEnd(13), '(stand-in, no product)');
      continue;
    }
    const p = o.product;
    console.log(type.padEnd(13), p.title, '|', '$' + p.price, '| 3D model:', p.modelUrl ? 'yes' : 'no');
    console.log(' '.repeat(14), p.url);
  }
}
console.log('layout', layout.id);

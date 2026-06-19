// Demo scene builder, loaded only via ?demo=1 — a quick self-test / showcase
// that exercises placement, stacking, footprints, the flush "ground" behaviour
// and the generated single-colour floor tiles.
export async function buildDemo(ed) {
  ed.newLevel();
  ed.resize(8, 8);

  const putAt = async (model, hoverCol, hoverRow, rot = 0) => {
    await ed.selectModel(model);
    ed.rotation = rot;
    const p = ed.worldFromCell(hoverCol, hoverRow);
    ed._hoverPoint = { x: p.x, z: p.z };
    ed._place();
  };
  const put = (model, col, row, rot = 0) => putAt(model, col, row, rot);

  // hand-laid checkerboards from the generated 1×1 tiles:
  //   cols 0–5 → white/black,  cols 6–7 → the two style-B browns
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const odd = (c + r) % 2 === 1;
      const model = c < 6
        ? (odd ? 'tile_black' : 'tile_white')
        : (odd ? 'tile_brown_dark' : 'tile_brown_light');
      await put(model, c, r);
    }
  }

  // kitchen objects on top of the checker (sit flush at ground level)
  await put('kitchencounter_straight_A', 1, 1);
  await put('plate', 1, 1);
  await put('kitchencounter_straight_A', 2, 1);
  await put('kitchencounter_sink', 3, 1);
  await put('stove_single_countertop', 4, 1);
  await put('pan_A', 4, 1);
  await put('oven', 5, 1);
  await put('crate_tomatoes', 1, 3);
  await put('crate_lettuce', 2, 3);
  await put('kitchentable_A', 3, 4);
  await put('chair_A', 3, 5, 2);

  ed.clearPlaceMode();
  ed.controls.theta = Math.PI * 0.22;
  ed.controls.phi = Math.PI * 0.4;
  ed.controls.update();
}

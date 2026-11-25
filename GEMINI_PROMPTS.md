# Meow Open City — Gemini Patch Procedure

This file contains the **exact step-by-step prompts** used to improve the game.
Follow the steps in order. Never ask Gemini to rewrite a whole file.

---

## Ground rules (send once at the start of every new Gemini chat)

> I am working on a GTA-style browser game called Meow Open City.
> Reply with **SURGICAL PATCHES ONLY — never whole-file rewrites**.
> Each patch must be in its own code block with a `LABEL PATCH n — file — what to do` heading above it.
> Output only the patch code: no explanation, no ellipsis (`...`), no placeholder classes.
> Before writing code, read the real structure I give you. Never invent method names, IDs, or imports.
> The game is played mostly on **phones in landscape**, so every change must stay mobile-first.
> End your reply with `=== PATCHES COMPLETE ===`.

After Gemini replies:

1. Download every code block (Gemini's **Download code** button).
2. Apply patches one at a time with a targeted edit/insert — never overwrite whole files.
3. Fix mojibake: Gemini downloads can be mis-decoded as Windows-1252. Run the repair script if needed.
4. Validate: `node --check js/<file>.js` for every changed JS file.
5. Start the server (`npm start`) and open `http://localhost:3000/?v=<unique>` to bypass cache.
6. Check the browser console for errors (`browser.console`, level `error`).
7. Commit and push only after all checks pass.

---

## Step 1 — Remove the bridges

> LABEL PATCH 1 — world.js — DELETE-ONLY.
> Remove the line `this._buildBridges();` from `buildCity()`. Keep `_buildTerrain()` and all other calls.
> Do not output whole file. Output only the exact line to delete.

**Acceptance:** no bridge decks or pillars in the 3D world; all roads stay flat and connected.

---

## Step 2 — Mobile landscape layout (buttons must never cover HUD)

> LABEL PATCH 1 — index.html — REPLACEMENT for the `.hud-top-left` block.
> Keep the minimap and the COINS/FUEL chips. After the chips row, add a flex row with the existing
> `#touch-taxi` and `#touch-shop` buttons. Use class `hud-action-row`.
>
> LABEL PATCH 2 — index.html — REPLACEMENT for the `.hud-top-right` block.
> Keep combo, health, LEVEL chip and speedometer. After `.top-speedo`, add
> `<div class="hud-action-row hud-action-row-right">` with the existing `#touch-pause` button.
>
> LABEL PATCH 3 — index.html — DELETE-ONLY: remove the old `.touch-group-actions` div from `.touch-controls`.
>
> LABEL PATCH 4 — css/style.css — ADD-ONLY: `.hud-action-row { display:flex; gap:8px; pointer-events:none; }`,
> `.hud-action-row-right { justify-content:flex-end; }`, `.hud-action-row .touch-btn { pointer-events:auto; }`.
> Also make `.minimap-card` and `.minimap` `border-radius:50%` and 132px square.
> Keep the existing landscape media queries.

**Acceptance:** buttons flow *after* their HUD groups. Follow the DOM instead of using fixed `top` values,
so they can never overlap the map, coins/fuel, or speedometer on any screen size.

---

## Step 3 — Normal driving speed

> LABEL PATCH 1 — config.js — REPLACEMENT for these CAR_CFG values only:
> `accel: 18`, `reverseAccel: 12`, `brakeDecel: 30`, `coastDecel: 9`,
> `maxSpeed: 30`, `reverseMaxSpeed: 12`, `driftMaxSpeed: 27`.
> Output only those lines. No other config changes.

**Acceptance:** one tap of GAS no longer rockets away; top speed is about 108 km/h for a sedan.

---

## Step 4 — Calm police

> LABEL PATCH 1 — world.js — REPLACEMENT inside `_spawnPolice()`:
> `targetCount = clamp(Math.floor(wantedLevel) - 1, 0, 3)` so 1 star = no cops, 2 stars = 1 cop, etc.
>
> LABEL PATCH 2 — world.js — REPLACEMENT inside `_updatePolice()` for the steering/speed lines:
> turn rate `safeDt * 2.2`, and `targetSpeed = dist > 60 ? 12 : dist > 12 ? 18 + wantedLevel : 8`,
> lerp factor `safeDt * 2`.
>
> LABEL PATCH 3 — config.js — REPLACEMENT: `wantedDecay: 0.12`.

**Acceptance:** 1 wanted star shows no police; stars decay in about 8 seconds each.

---

## Step 5 — Circular radar minimap that follows the player anywhere

> LABEL PATCH 1 — game.js — REPLACEMENT for `_updateMinimap()`.
> Requirements: canvas is a circle. Center the view on the car at all times, with `range = 170`
> world units visible in each direction. Use `toX(wx) = cx + ((wx - car.x)/(range*2))*w`,
> `toY(wz) = cy + ((wz - car.z)/(range*2))*h`. Clip drawing to a circle with `ctx.arc(...); ctx.clip()`.
> Draw in order: dark background, street grid, fuel stations (`F` squares), taxi/race route
> (animated dashed line, pulsing marker with `P`/`D`/`R`), traffic dots, player arrow fixed at center,
> circular border, and an `N` compass at top. Never clamp the car to the city square.
> Keep all existing IDs and imports. Output ONLY the complete method.

**Acceptance:** the map is a circle, follows the car outside the city, and always shows the objective.

---

## Step 6 — Persistent player profile (levels and data via local storage/cookies)

> LABEL PATCH 1 — new file js/cityStorage.js — CREATE.
> Export `CityStorage` with a versioned schema (`meowOpenCity.v1`), sanitized defaults,
> localStorage with in-memory fallback for private mode. Fields: `coins`, `ownedVehicles`,
> `currentVehicle`, `layout`, `xp`, `level`, `totalDistance`, `faresEarned`, `faresCompleted`,
> `racesWon`, `bestTimeSec`, `lastPlayed`. Methods: `get`, `save`, `reset`, `addCoins`, `addXp`,
> `unlockVehicle`, `setLayout`, `addDistance`, `addFare`. Level curve: `floor(sqrt(xp/120)) + 1`.
> Output only the file.
>
> LABEL PATCH 2 — game.js — ADD-ONLY: import `{ CityStorage } from './cityStorage.js'`.
>
> LABEL PATCH 3 — game.js — REPLACEMENT for the coin/profile lines in the constructor.
> Restore `coins`, `level`, `ownedVehicles`, `currentVehicle`, `controlLayout` from `CityStorage.get()`.
>
> LABEL PATCH 4 — game.js — REPLACEMENT for the localStorage load in `startGame()`.
> Use `CityStorage.get()` and apply `this.car.setVehicleType(this.currentVehicle)`.
>
> LABEL PATCH 5 — game.js — REPLACEMENT for the `[data-vehicle]` handler's save call.
> Use `CityStorage.unlockVehicle(vType)` instead of raw localStorage.
>
> LABEL PATCH 6 — game.js — REPLACEMENT inside `_applyLayoutPreset()` save line. Use `CityStorage.setLayout(chosen)`.
>
> LABEL PATCH 7 — game.js — REPLACEMENT inside `_endFare()` payout block.
> Use `const p = CityStorage.addFare(farePaid); this.coins = p.coins; this.level = p.level;`.
> Remove the old `this.coins += fare` line in `_loop()` so coins are not counted twice.
>
> LABEL PATCH 8 — game.js — ADD-ONLY inside `_loop()` after `this.world.update(...)`:
> accumulate distance between frames into `this._distanceAccum`; every 60 m call
> `CityStorage.addDistance(...)` and refresh `this.level`.
>
> LABEL PATCH 9 — index.html — REPLACEMENT for the LEVEL chip: `<span class="chip-label">LEVEL</span>`
> and `<span id="hud-level" class="chip-value">LV 1</span>`.
>
> LABEL PATCH 10 — game.js — ADD-ONLY in `_updateHud()`: set `#hud-level` to `LV ${this.level}`.

**Acceptance:** coins, unlocked vehicles, layout, level and XP survive a full page reload.
Private mode must not throw errors.

---

## Final validation checklist (run after every step)

```powershell
# 1. Syntax
foreach($f in @('js\config.js','js\car.js','js\world.js','js\game.js','js\effects.js','js\cityStorage.js')) {
  $t = "$env:TEMP\chk_$([IO.Path]::GetFileName($f))"
  [IO.File]::WriteAllText($t, [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8), [Text.Encoding]::UTF8)
  node --check $t
}

# 2. Start and open with a cache-busting query
npm start
# open http://localhost:3000/?v=<unique>

# 3. In browser: zero console errors, HUD boxes do not overlap,
#    reload page and confirm profile data persists.

# 4. Commit only when green
git add -A
git commit -m "<step description>"
git push origin main
```

---

## Notes for the next Gemini session

- Gemini replies are downloaded as UTF-8 but PowerShell can mis-decode them as Windows-1252,
  producing `â€¢` / `Ã¢â‚¬Â¢`. Repair before saving.
- Never accept a patch that invents classes such as `GameEngine`, `PlayerController`, or methods
  that do not exist in the structure shown above.
- Always keep patches small and verify one step at a time.

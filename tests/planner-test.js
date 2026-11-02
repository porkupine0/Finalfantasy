const fs = require("fs");
// Loads the planner engine straight out of index.html (between the PLANNER-ENGINE markers) and checks it.
// Run with:  node tests/planner-test.js
const html = fs.readFileSync(__dirname + "/../index.html", "utf8");
const src = html.slice(html.indexOf("// ==PLANNER-ENGINE=="), html.indexOf("// ==END-PLANNER-ENGINE=="));
const E = new Function(src + "; return { optimize, compile, score, chapterInfo, buildPositions, BLUE };")();
const S = (o = {}) => ({ leader:"Cloud", diff:"normal", goal:"win", stable:false, healerPick:"auto", el:"auto", locks:[], ...o });
let fails = 0; const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const has = (r, c, side, pair) => r.out[c][side].pairs.some(p => p[0] === pair[0] && p[1] === pair[1]);
const anyHas = (r, c, m) => ["w","a"].some(k => r.out[c][k].singles.includes(m) || r.out[c][k].pairs.some(p => p.includes(m)));

// ---------- 1) Optimality: compare the search with brute force on random small cases ----------
function brute(input){
  const K = E.compile(input), N = K.N, nT = K.nT; let best = -Infinity; const A = new Int16Array(N).fill(-1), u = new Int16Array(nT);
  (function rec(i){ if (i === N){ const v = E.score(K, A, false); if (v > best) best = v; return; }
    for (let t = -1; t < nT; t++){ if (t >= 0 && u[t] >= K.owned[t]) continue; A[i] = t; if (t >= 0) u[t]++; rec(i + 1); if (t >= 0) u[t]--; } A[i] = -1; })(0);
  return best;
}
const POOL = ["Healing","HP Up","Elemental","Lightning","Ice","Fire","Magnify","Assess","Steadfast Block","Revival","Time","MP Up","Barrier","Wind","Provoke"];
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let worst = 0, cases = 0, matched = 0;
for (let t = 0; t < 400; t++){
  const party = [["Cloud"],["Cloud","Aerith"],["Tifa","Barret"],["Cloud","Barret"]][t % 4];
  const slots = {}; party.forEach(c => slots[c] = { ws:Math.floor(rnd()*2)+ (party.length===1?1:0), wp:Math.floor(rnd()*2), as:Math.floor(rnd()*2), ap: party.length === 1 ? Math.floor(rnd()*2) : 0 });
  const nPos = party.reduce((n, c) => n + slots[c].ws + slots[c].as + 2 * (slots[c].wp + slots[c].ap), 0);
  if (nPos > 7 || nPos === 0) continue;
  const inv = {}; for (let k = 0; k < 6; k++){ const m = POOL[Math.floor(rnd()*POOL.length)]; inv[m] = Math.min(2, (inv[m] || 0) + 1); }
  const maxed = {}; for (const m of Object.keys(inv)) if (rnd() < .35) maxed[m] = 1;
  const input = { chars:party, slots, inv, maxed, ch:[5,8,13,17,9][t % 5], settings:S({ goal: t % 3 === 0 ? "level" : "win" }) };
  const r = E.optimize(input), b = brute(input); cases++;
  const gap = b - r.score; if (gap < 1e-6) matched++; worst = Math.max(worst, gap);
}
ok(matched === cases, `optimizer matches brute-force optimum on ${matched}/${cases} random small cases (worst gap ${worst.toFixed(2)})`);

// ---------- 2) Guide scenarios ----------
const full = { ws:2, wp:2, as:2, ap:1 };
// Ch13 Failed Experiment: guides say Elemental + Ice on Tifa's/Barret's weapon; it absorbs Lightning.
let r = E.optimize({ chars:["Tifa","Barret"], slots:{ Tifa:full, Barret:full }, ch:13, settings:S({ leader:"Tifa" }),
  inv:{ Elemental:2, Ice:2, Lightning:2, Healing:2, "HP Up":2, "Steadfast Block":2, Revival:1, Assess:1, Fire:1 } });
ok(has(r,"Tifa","w",["Elemental","Ice"]) && has(r,"Barret","w",["Elemental","Ice"]), "Ch13: Elemental + Ice on both Tifa's and Barret's weapons (Game8/PowerPyx)");
ok(!["Tifa","Barret"].some(c => ["w"].some(k => r.out[c][k].pairs.some(p => p[0]==="Elemental" && p[1]==="Lightning"))), "Ch13: never pairs Elemental + Lightning on a weapon (boss absorbs Lightning)");
// Ch17 Rufus: Gamer Guides puts Elemental + Lightning on Cloud's armor.
r = E.optimize({ chars:["Cloud","Tifa","Barret","Aerith"], slots:{ Cloud:full, Tifa:full, Barret:full, Aerith:full }, ch:17, settings:S(),
  inv:{ Elemental:2, Lightning:3, Ice:1, Fire:1, Healing:4, Magnify:1, Revival:2, "HP Up":3, "MP Up":1, "Magic Up":1, Assess:1, "Steadfast Block":2, Provoke:1, Time:2, Barrier:1, "First Strike":1 } });
ok(has(r,"Cloud","a",["Elemental","Lightning"]), "Ch17: Elemental + Lightning on Cloud's armor for Rufus (Gamer Guides)");
ok(has(r,"Aerith","w",["Magnify","Healing"]) || has(r,"Aerith","a",["Magnify","Healing"]), "Magnify + Healing goes on Aerith, the healer (GameSpot, GameWith, Game Rant)");
ok(anyHas(r,"Cloud","Assess") && !["Tifa","Barret","Aerith"].some(c => anyHas(r,c,"Assess")), "Assess on the character you control (GameSpot)");
ok(anyHas(r,"Barret","Provoke"), "Provoke on Barret, the tank");
ok(["Cloud","Tifa","Barret","Aerith"].filter(c => anyHas(r,c,"Healing")).length >= 2, "At least two characters carry Healing (GameSpot)");
ok(anyHas(r,"Aerith","Revival"), "Revival on the healer (GameWith, Game Rant)");
// Ch8 Reno: Elemental + Lightning on Cloud's armor; Rude is weak to Wind.
r = E.optimize({ chars:["Cloud","Aerith"], slots:{ Cloud:{ws:2,wp:1,as:0,ap:1}, Aerith:{ws:2,wp:1,as:1,ap:0} }, ch:8, settings:S(),
  inv:{ Elemental:1, Lightning:1, Wind:1, Healing:2, "HP Up":1, Fire:1, Ice:1, Assess:1 } });
ok(has(r,"Cloud","a",["Elemental","Lightning"]), "Ch8: Elemental + Lightning on Cloud's armor vs Reno (Gamer Guides)");
ok(anyHas(r,"Aerith","Wind") || anyHas(r,"Cloud","Wind"), "Ch8: someone carries Wind for Rude");
// Ch11: Steal must be equipped for Eligor.
r = E.optimize({ chars:["Cloud","Tifa","Aerith"], slots:{ Cloud:{ws:3,wp:1,as:0,ap:0}, Tifa:{ws:3,wp:0,as:1,ap:0}, Aerith:{ws:3,wp:1,as:0,ap:0} }, ch:11, settings:S(),
  inv:{ Steal:1, Healing:3, "HP Up":2, Ice:2, Fire:1, Elemental:1, Magnify:1, Assess:1, "Steadfast Block":1, "MP Up":1, Revival:1, "Deadly Dodge":1, Wind:1 } });
ok(["Cloud","Tifa","Aerith"].some(c => anyHas(r,c,"Steal")), "Ch11: Steal is equipped (Bladed Staff)");
ok(has(r,"Cloud","w",["Elemental","Ice"]), "Ch11: Elemental + Ice on Cloud's weapon for Eligor");
// Erik's current setup: Cloud, 2 singles + 1 linked pair on the weapon, no support materia yet.
r = E.optimize({ chars:["Cloud"], slots:{ Cloud:{ws:2,wp:1,as:0,ap:0} }, ch:3, settings:S(), inv:{ Healing:1, "HP Up":1, "Deadly Dodge":1, Lightning:1, Fire:1, Ice:1, Assess:1 } });
console.log("     Erik now:", JSON.stringify(r.out.Cloud.w), "spare:", r.spare.join(", "));

// ---------- 3) Stability ----------
const base = { chars:["Cloud","Tifa","Barret"], slots:{ Cloud:full, Tifa:full, Barret:full }, ch:15,
  inv:{ Elemental:1, Lightning:2, Wind:1, Ice:1, Fire:1, Healing:3, Revival:1, "HP Up":3, "MP Up":1, "Steadfast Block":2, Assess:1, Time:1, Barrier:1, Provoke:1, "First Strike":1, "ATB Boost":1, Chakra:1 } };
const r0 = E.optimize({ ...base, settings:S({ stable:true }) });
const inv2 = { ...base.inv, "Deadly Dodge":1 };
const rA = E.optimize({ ...base, inv:inv2, settings:S({ stable:true, last:r0.holding }) });
const rB = E.optimize({ ...base, inv:inv2, settings:S({ stable:false }) });
const moved = (x, y) => base.chars.reduce((n, c) => n + Object.keys({ ...x[c], ...y[c] }).reduce((k, m) => k + Math.abs((x[c][m] || 0) - (y[c][m] || 0)), 0), 0) / 2;
ok(moved(r0.holding, rA.holding) <= moved(r0.holding, rB.holding), `Keep-changes-small: adding 1 materia moves ${moved(r0.holding, rA.holding)} materia (vs ${moved(r0.holding, rB.holding)} without it)`);
const rL = E.optimize({ ...base, settings:S({ locks:[["Tifa","Assess"]] }) });
ok(anyHas(rL,"Tifa","Assess"), "Locks: a locked materia stays on the chosen character");

// ---------- 4) Speed on a full late-game party ----------
const big = { chars:["Cloud","Tifa","Barret","Aerith"], slots:{ Cloud:{ws:2,wp:3,as:0,ap:2}, Tifa:{ws:2,wp:3,as:0,ap:2}, Barret:{ws:2,wp:3,as:0,ap:2}, Aerith:{ws:2,wp:3,as:0,ap:2} }, ch:17,
  inv:{ Elemental:2, Magnify:2, Lightning:3, Ice:2, Fire:2, Wind:2, Healing:4, Revival:2, "HP Up":4, "MP Up":3, "Magic Up":2, "Steadfast Block":3, Assess:1, Time:2, Barrier:2, Provoke:1, "First Strike":2, "ATB Boost":2, Chakra:2, Prayer:1, Parry:1, "ATB Stagger":1, "Deadly Dodge":1, Cleansing:1, Poison:2, Warding:1, "MP Absorption":1, "HP Absorption":1, Steal:1, "Enemy Skill":1 } };
const t0 = Date.now(); E.optimize({ ...big, settings:S() }); const ms = Date.now() - t0;
ok(ms < 1500, `Full 4-character late-game party solved in ${ms} ms`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED");
// ---------- 5) Settings behave as described ----------
{ const tight = { ws:2, wp:1, as:1, ap:0 }; const inp = { chars:["Cloud","Tifa","Barret"], slots:{ Cloud:tight, Tifa:tight, Barret:tight }, ch:15, inv:{ ...base.inv, Revival:3, "AP Up":1 } };
  const n = E.optimize({ ...inp, settings:S({ diff:"normal" }) }), h = E.optimize({ ...inp, settings:S({ diff:"hard" }) });
  const cntRev = r => base.chars.filter(c => anyHas(r, c, "Revival")).length;
  ok(cntRev(h) >= cntRev(n) && cntRev(h) >= 2, `Hard mode spreads Revival wider (${cntRev(n)} on Normal → ${cntRev(h)} on Hard; GameWith hard-mode advice)`);
  const lv = E.optimize({ ...inp, slots:{ Cloud:full, Tifa:full, Barret:full }, settings:S({ goal:"level" }) });
  ok(base.chars.some(c => ["w","a"].some(k => lv.out[c][k].pairs.some(p => p[0] === "AP Up"))), "'Also level materia' puts AP Up in a linked pair");
  const a1 = JSON.stringify(E.optimize({ ...inp, settings:S() }).out), a2 = JSON.stringify(E.optimize({ ...inp, settings:S() }).out);
  ok(a1 === a2, "Same input always gives the same setup");
}
// ---------- 6) Maxed materia ----------
{ const solo = { chars:["Cloud"], slots:{ Cloud:{ ws:1, wp:0, as:0, ap:0 } }, ch:15, inv:{ "HP Up":2 }, maxed:{ "HP Up":1 } };
  const w = E.optimize({ ...solo, settings:S({ goal:"win" }) }), l = E.optimize({ ...solo, settings:S({ goal:"level" }) });
  ok(w.out.Cloud.w.singles[0] === "HP Up ★", "Win the fights: equips the maxed copy over an unmaxed one");
  ok(l.out.Cloud.w.singles[0] === "HP Up", "Win + level: equips the unmaxed copy so it earns AP");
  const ap = E.optimize({ chars:["Cloud"], slots:{ Cloud:{ ws:1, wp:1, as:0, ap:0 } }, ch:15, inv:{ "AP Up":1, "HP Up":1, "MP Up":1 }, maxed:{ "HP Up":1 }, settings:S({ goal:"level" }) });
  ok(ap.out.Cloud.w.pairs.some(p => p[0] === "AP Up" && p[1] === "MP Up"), "AP Up links to the unmaxed materia, never a maxed one");
  const el = E.optimize({ chars:["Tifa","Barret"], slots:{ Tifa:{ws:1,wp:1,as:0,ap:0}, Barret:{ws:1,wp:1,as:0,ap:0} }, ch:13, inv:{ Elemental:2, Ice:2 }, maxed:{ Elemental:1 }, settings:S({ leader:"Tifa" }) });
  ok(el.out.Tifa.w.pairs.some(p => p[0] === "Elemental ★"), "The maxed Elemental goes to the strongest attacker");
}
console.log(fails ? `\n${fails} FAILED` : "\nALL PASSED (incl. settings + maxed)");

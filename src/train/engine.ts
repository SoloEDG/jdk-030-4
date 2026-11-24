import type {
  ApplyResult,
  Dir,
  HandEvent,
  LevelDef,
  PlateDef,
  ShuntAction,
  SwitchDef,
  TrainState,
  Vec,
} from "./types";

export function cloneState(state: TrainState): TrainState {
  return JSON.parse(JSON.stringify(state)) as TrainState;
}

export function vecDir(from: Vec, to: Vec): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1 && dy === 0) return "e";
  if (dx === -1 && dy === 0) return "w";
  if (dx === 0 && dy === -1) return "n";
  if (dx === 0 && dy === 1) return "s";
  return null;
}

export function sameEdge(a: string, b: string, c: string, d: string): boolean {
  return (a === c && b === d) || (a === d && b === c);
}

export function hasEdge(level: LevelDef, a: string, b: string): boolean {
  return level.edges.some(([x, y]) => sameEdge(x, y, a, b));
}

export function adjacentNodes(level: LevelDef, node: string): string[] {
  const out: string[] = [];
  for (const [a, b] of level.edges) {
    if (a === node) out.push(b);
    if (b === node) out.push(a);
  }
  return out;
}

export function vehicleAt(state: TrainState, node: string): string | null {
  for (const [id, at] of Object.entries(state.pos)) {
    if (at === node) return id;
  }
  return null;
}

export function vehicleSpec(level: LevelDef, id: string) {
  const spec = level.vehicles.find((v) => v.id === id);
  if (!spec) throw new Error(`未知车辆 ${id}`);
  return spec;
}

export function findConsist(
  state: TrainState,
  id: string,
): { cut: string[]; cutIndex: number; index: number } | null {
  for (let cutIndex = 0; cutIndex < state.consists.length; cutIndex += 1) {
    const cut = state.consists[cutIndex];
    const index = cut.indexOf(id);
    if (index >= 0) return { cut, cutIndex, index };
  }
  return null;
}

export function locoId(level: LevelDef): string {
  return level.vehicles.find((v) => v.role === "loco")?.id ?? "loco";
}

export function findSwitch(level: LevelDef, id: string): SwitchDef | undefined {
  return level.switches.find((s) => s.id === id);
}

export function routeAllows(
  level: LevelDef,
  state: TrainState,
  from: string,
  to: string,
): boolean {
  if (!hasEdge(level, from, to)) return false;

  const entering = level.switches.find((item) => item.at === to);
  if (entering) {
    if (from === entering.stem) return true;
    if (from === entering.main) return state.switches[entering.id] === "main";
    if (from === entering.diverge) return state.switches[entering.id] === "diverge";
    return false;
  }

  const leaving = level.switches.find((item) => item.at === from);
  if (!leaving) return true;
  if (to === leaving.stem) return true;
  if (to === leaving.main) return state.switches[leaving.id] === "main";
  if (to === leaving.diverge) return state.switches[leaving.id] === "diverge";
  return false;
}

export function doorOnEdge(level: LevelDef, from: string, to: string) {
  return level.doors.find((door) => sameEdge(door.edge[0], door.edge[1], from, to));
}

export interface PlateReport {
  plate: PlateDef;
  vehicleIds: string[];
  totalLoad: number;
  powered: boolean;
}

export function plateReports(level: LevelDef, state: TrainState): PlateReport[] {
  return level.plates.map((plate) => {
    const vehicleIds = Object.entries(state.pos)
      .filter(([, node]) => plate.nodes.includes(node))
      .map(([id]) => id);
    const vehicles = vehicleIds.map((id) => vehicleSpec(level, id));
    const totalLoad = vehicles.reduce((sum, v) => sum + v.load, 0);
    const powered =
      vehicleIds.length > 0 &&
      (plate.accept === "any" || vehicles.some((v) => v.cargo === plate.accept));
    return { plate, vehicleIds, totalLoad, powered };
  });
}

export function isDoorOpen(level: LevelDef, state: TrainState, doorId: string): boolean {
  const door = level.doors.find((d) => d.id === doorId);
  if (!door) return true;
  if (door.control === "plate") {
    return plateReports(level, state).some(
      (report) => report.powered && report.plate.doorIds.includes(doorId),
    );
  }
  return state.doors[doorId] ?? door.openByDefault ?? false;
}

export function switchStraddledBy(
  _level: LevelDef,
  state: TrainState,
  sw: SwitchDef,
): string | null {
  for (const id of Object.keys(state.pos)) {
    const current = state.pos[id];
    const before = state.prev[id] ?? current;
    // A car is still in the switch throat if either end of its last occupied
    // segment touches the machine node. This also covers the "across the legs"
    // interval immediately after leaving the frog.
    if (current === sw.at || before === sw.at) return id;

    // Defensive literal check for an edited consist whose two cars occupy both
    // divergent legs. Such a layout must never permit throwing the points.
    if (current === sw.main || current === sw.diverge) {
      const other = Object.entries(state.pos).some(([otherId, node]) => {
        if (otherId === id) return false;
        return (
          (current === sw.main && node === sw.diverge) ||
          (current === sw.diverge && node === sw.main)
        );
      });
      if (other) return id;
    }
  }
  return null;
}

export function blockedDriveReason(
  level: LevelDef,
  state: TrainState,
  lead: string,
  to: string,
): HandEvent | null {
  const located = findConsist(state, lead);
  if (!located) return { tone: "danger", message: `${lead} 不在任何车列中。` };
  const { cut, index } = located;
  if (index !== 0 && index !== cut.length - 1) {
    return { tone: "danger", message: "只能从车列的一端引导移动。" };
  }
  const from = state.pos[lead];
  if (!from) return { tone: "danger", message: "找不到先导车的位置。" };
  if (!hasEdge(level, from, to)) {
    return { tone: "danger", message: `${from} 与 ${to} 之间没有轨道。` };
  }
  if (!routeAllows(level, state, from, to)) {
    const sw = level.switches.find((item) => item.at === from);
    return {
      tone: "warn",
      message: sw
        ? `道岔当前开通${state.switches[sw.id] === "main" ? "直股" : "岔股"}，不能进入另一条岔腿。`
        : "当前进路不通。",
    };
  }
  const occupiedBy = vehicleAt(state, to);
  if (occupiedBy) {
    return { tone: "warn", message: `${to} 仍被 ${vehicleSpec(level, occupiedBy).code} 占用。` };
  }
  const door = doorOnEdge(level, from, to);
  if (door && !isDoorOpen(level, state, door.id)) {
    return {
      tone: "danger",
      message: `「${door.label}」关闭：整列在门前停住，车钩间距保持不变。`,
    };
  }
  return null;
}

export function legalNextNodes(level: LevelDef, state: TrainState, lead: string): string[] {
  return adjacentNodes(level, state.pos[lead]).filter((to) => {
    if (!routeAllows(level, state, state.pos[lead], to)) return false;
    if (vehicleAt(state, to)) return false;
    const door = doorOnEdge(level, state.pos[lead], to);
    if (door && !isDoorOpen(level, state, door.id)) return false;
    return true;
  });
}

function nodeLess(a: Vec, b: Vec): boolean {
  return a.x < b.x || (a.x === b.x && a.y < b.y);
}

/** Represent the same physical end-to-end cut in one stable direction. */
function canonicalCut(cut: string[], level: LevelDef, state: TrainState): string[] {
  if (cut.length < 2) return [...cut];
  const a = level.nodes[state.pos[cut[0]]];
  const b = level.nodes[state.pos[cut[cut.length - 1]]];
  if (a && b && nodeLess(b, a)) return [...cut].reverse();
  return [...cut];
}

function canonicalize(state: TrainState, level: LevelDef): TrainState {
  state.consists = state.consists.map((cut) => canonicalCut(cut, level, state));
  return state;
}

export function applyAction(level: LevelDef, source: TrainState, action: ShuntAction): ApplyResult {
  const blocked = preflight(level, source, action);
  if (blocked) return { ok: false, state: source, event: blocked };

  const state = cloneState(source);
  let event: HandEvent = { tone: "info", message: "完成一手调车。" };

  if (action.kind === "drive") {
    const located = findConsist(state, action.lead);
    if (!located) {
      return { ok: false, state: source, event: { tone: "danger", message: "车列状态已变化。" } };
    }
    const { cut, index } = located;
    const oldPos = { ...state.pos };
    const lead = action.lead;
    const to = action.to;

    if (index === 0) {
      state.prev[cut[0]] = oldPos[cut[0]];
      state.pos[cut[0]] = to;
      for (let i = 1; i < cut.length; i += 1) {
        state.prev[cut[i]] = oldPos[cut[i]];
        state.pos[cut[i]] = oldPos[cut[i - 1]];
      }
    } else {
      const last = cut.length - 1;
      state.prev[cut[last]] = oldPos[cut[last]];
      state.pos[cut[last]] = to;
      for (let i = 0; i < last; i += 1) {
        state.prev[cut[i]] = oldPos[cut[i]];
        state.pos[cut[i]] = oldPos[cut[i + 1]];
      }
    }

    const engineId = locoId(level);
    if (cut.includes(engineId)) {
      const oldNode = level.nodes[oldPos[engineId]];
      const newNode = level.nodes[state.pos[engineId]];
      const movedDir = oldNode && newNode ? vecDir(oldNode, newNode) : null;
      if (movedDir) state.facing[engineId] = movedDir;
    }

    const leadSpec = vehicleSpec(level, lead);
    event =
      leadSpec.role === "loco"
        ? { tone: "success", message: `机车端移动至 ${to}，全列按原钩距跟进。` }
        : { tone: "success", message: `由 ${leadSpec.code} 引导，车列移至 ${to}；钩距不变。` };
  }

  if (action.kind === "toggle-switch") {
    const sw = findSwitch(level, action.id);
    if (!sw) return { ok: false, state: source, event: { tone: "danger", message: "找不到道岔。" } };
    state.switches[sw.id] = state.switches[sw.id] === "main" ? "diverge" : "main";
    event = {
      tone: "success",
      message: `「${sw.label}」扳向${state.switches[sw.id] === "main" ? "直股" : "岔股"}。`,
    };
  }

  if (action.kind === "set-door") {
    const door = level.doors.find((d) => d.id === action.id);
    if (!door) return { ok: false, state: source, event: { tone: "danger", message: "找不到门。" } };
    state.doors[door.id] = action.open;
    event = { tone: "success", message: `「${door.label}」已${action.open ? "打开" : "关闭"}。` };
  }

  if (action.kind === "split") {
    const locatedA = findConsist(state, action.a);
    if (!locatedA) return { ok: false, state: source, event: { tone: "danger", message: "找不到车钩。" } };
    const { cut, cutIndex, index } = locatedA;
    const other = action.a === cut[index] ? action.b : action.a;
    const adjacent = cut[index + 1] === other || cut[index - 1] === other;
    if (!adjacent) {
      return { ok: false, state: source, event: { tone: "danger", message: "这两辆车没有连挂。" } };
    }
    const splitAfter = cut[index + 1] === other ? index : index - 1;
    const left = cut.slice(0, splitAfter + 1);
    const right = cut.slice(splitAfter + 1);
    state.consists.splice(cutIndex, 1, left, right);
    event = { tone: "success", message: `已在 ${action.a} 与 ${action.b} 之间摘钩。` };
  }

  if (action.kind === "couple") {
    const merged = mergeEndpointCuts(level, state, action.a, action.b);
    if (!merged) {
      return { ok: false, state: source, event: { tone: "warn", message: "只能连接两个车列的相邻端。" } };
    }
    state.consists = merged;
    event = { tone: "success", message: `${action.a} 与 ${action.b} 已按真实连挂方向接钩。` };
  }

  state.steps = source.steps + 1;
  canonicalize(state, level);
  return { ok: true, state, event };
}

function preflight(level: LevelDef, state: TrainState, action: ShuntAction): HandEvent | null {
  if (action.kind === "drive") {
    return blockedDriveReason(level, state, action.lead, action.to);
  }
  if (action.kind === "toggle-switch") {
    const sw = findSwitch(level, action.id);
    if (!sw) return { tone: "danger", message: "找不到道岔。" };
    const straddled = switchStraddledBy(level, state, sw);
    if (straddled) {
      return {
        tone: "danger",
        message: `「${sw.label}」下还有 ${vehicleSpec(level, straddled).code} 跨在岔喉或两条岔腿之间，不能扳道岔。`,
      };
    }
    return null;
  }
  if (action.kind === "set-door") {
    const door = level.doors.find((d) => d.id === action.id);
    if (!door) return { tone: "danger", message: "找不到门。" };
    if (door.control === "plate") {
      return { tone: "warn", message: "这扇门由踏板负载控制，不能手动扳动。" };
    }
    if (!action.open) {
      const [edgeA, edgeB] = door.edge;
      const carA = vehicleAt(state, edgeA);
      const carB = vehicleAt(state, edgeB);
      if (carA && carB) {
        return {
          tone: "warn",
          message: `「${door.label}」的门区仍被 ${vehicleSpec(level, carA).code}、${vehicleSpec(level, carB).code} 或其车钩跨越，不能关门。`,
        };
      }
    }
    return null;
  }
  if (action.kind === "split") {
    const located = findConsist(state, action.a);
    if (!located) return { tone: "danger", message: "找不到车钩。" };
    const { cut, index } = located;
    const adjacent = cut[index - 1] === action.b || cut[index + 1] === action.b;
    if (!adjacent) return { tone: "warn", message: "只能摘下实际相连的车钩。" };
    return null;
  }
  if (action.kind === "couple") {
    if (!mergeEndpointCuts(level, state, action.a, action.b)) {
      return { tone: "warn", message: "两端不相邻，不能接钩。" };
    }
    return null;
  }
  return { tone: "danger", message: "未知操作。" };
}

function mergeEndpointCuts(
  level: LevelDef,
  state: TrainState,
  a: string,
  b: string,
): string[][] | null {
  const ia = state.consists.findIndex((cut) => cut.includes(a));
  const ib = state.consists.findIndex((cut) => cut.includes(b));
  if (ia < 0 || ib < 0 || ia === ib) return null;
  const ca = state.consists[ia];
  const cb = state.consists[ib];
  if (ca[0] !== a && ca[ca.length - 1] !== a) return null;
  if (cb[0] !== b && cb[cb.length - 1] !== b) return null;
  if (!hasEdge(level, state.pos[a], state.pos[b])) return null;

  // Orient A so `a` is its trailing junction end, and B so `b` is its leading
  // junction end. Attaching from the opposite physical end therefore produces
  // the genuinely new ID sequence rather than relabelling the old one.
  const orientedA = ca[ca.length - 1] === a ? [...ca] : [...ca].reverse();
  const orientedB = cb[0] === b ? [...cb] : [...cb].reverse();
  const merged = [...orientedA, ...orientedB];

  const next = state.consists.filter((_, index) => index !== ia && index !== ib);
  next.push(merged);
  return next;
}

export function enumerateActions(level: LevelDef, state: TrainState): ShuntAction[] {
  const actions: ShuntAction[] = [];
  const engine = locoId(level);
  const located = findConsist(state, engine);

  if (located) {
    const ends = [located.cut[0], located.cut[located.cut.length - 1]].filter(
      (id, index, all) => all.indexOf(id) === index,
    );
    for (const lead of ends) {
      for (const to of legalNextNodes(level, state, lead)) {
        actions.push({ kind: "drive", lead, to });
      }
    }
  }

  for (const sw of level.switches) {
    if (!switchStraddledBy(level, state, sw)) {
      actions.push({ kind: "toggle-switch", id: sw.id });
    }
  }

  for (const door of level.doors) {
    if (door.control === "manual") {
      actions.push({ kind: "set-door", id: door.id, open: !isDoorOpen(level, state, door.id) });
    }
  }

  for (const cut of state.consists) {
    for (let i = 0; i < cut.length - 1; i += 1) {
      actions.push({ kind: "split", a: cut[i], b: cut[i + 1] });
    }
  }

  const endpoints = state.consists.flatMap((cut) => [cut[0], cut[cut.length - 1]]);
  const seenPairs = new Set<string>();
  for (const a of endpoints) {
    for (const b of endpoints) {
      if (a === b) continue;
      const pairKey = [a, b].sort().join("|");
      if (seenPairs.has(pairKey)) continue;
      if (!mergeEndpointCuts(level, state, a, b)) continue;
      seenPairs.add(pairKey);
      actions.push({ kind: "couple", a, b });
    }
  }

  return actions;
}

function sortedRecord(record: Record<string, string | boolean>) {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function stateKey(state: TrainState): string {
  return JSON.stringify({
    p: sortedRecord(state.pos),
    q: sortedRecord(state.prev),
    c: state.consists,
    s: sortedRecord(state.switches),
    d: sortedRecord(state.doors),
    f: sortedRecord(state.facing),
  });
}

export function stationReadout(level: LevelDef, state: TrainState): (string | null)[] {
  return level.station.berths.map((node) => vehicleAt(state, node));
}

export function isDelivered(level: LevelDef, state: TrainState): boolean {
  const actual = stationReadout(level, state);
  return actual.every((id, index) => id === level.station.order[index]);
}

export function nodeName(level: LevelDef, node: string): string {
  return level.names?.[node] ?? node;
}

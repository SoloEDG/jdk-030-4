import {
  BRANCH_RETURN_PLAN,
  DIRECT_DELIVERY_PLAN,
  DOOR_DELIVERY_PLAN,
  MIDDLE_RECONSIST_PLAN,
} from "./plans";
import type { LevelDef, TrainState } from "./types";

function makeStart(doors: Record<string, boolean> = { warehouse: true }): TrainState {
  const pos = { loco: "W", carC: "Y1", carB: "X", carA: "P" };
  return {
    pos,
    prev: { ...pos },
    consists: [["loco", "carC", "carB", "carA"]],
    switches: { sw1: "main" },
    doors,
    facing: { loco: "e" },
    steps: 0,
  };
}

const yardGeometry = {
  width: 11,
  height: 7,
  nodes: {
    W: { x: 0, y: 3 },
    Y1: { x: 1, y: 3 },
    X: { x: 2, y: 3 },
    P: { x: 3, y: 3 },
    D: { x: 4, y: 3 },
    S: { x: 5, y: 3 },
    E: { x: 6, y: 3 },
    B1: { x: 7, y: 3 },
    B2: { x: 8, y: 3 },
    B3: { x: 9, y: 3 },
    N1: { x: 2, y: 2 },
    N2: { x: 2, y: 1 },
    N3: { x: 6, y: 1 },
    N4: { x: 6, y: 2 },
    C1: { x: 5, y: 4 },
    C2: { x: 5, y: 5 },
    C3: { x: 6, y: 5 },
  },
  names: {
    W: "西尽端",
    X: "西喉/地磅",
    P: "踏板东",
    D: "仓库门",
    S: "一号道岔",
    E: "东喉",
    B1: "一站台位",
    B2: "二站台位",
    B3: "三站台位",
    C2: "岔线车位",
    C3: "短岔尽头",
  },
  edges: [
    ["W", "Y1"],
    ["Y1", "X"],
    ["X", "P"],
    ["P", "D"],
    ["D", "S"],
    ["S", "E"],
    ["E", "B1"],
    ["B1", "B2"],
    ["B2", "B3"],
    ["X", "N1"],
    ["N1", "N2"],
    ["N2", "N3"],
    ["N3", "N4"],
    ["N4", "E"],
    ["S", "C1"],
    ["C1", "C2"],
    ["C2", "C3"],
  ] as [string, string][],
  switches: [
    {
      id: "sw1",
      label: "仓库岔线",
      at: "S",
      stem: "D",
      main: "E",
      diverge: "C1",
    },
  ],
  doors: [
    {
      id: "warehouse",
      label: "仓库推拉门",
      edge: ["P", "D"] as [string, string],
      control: "manual" as const,
      openByDefault: true,
    },
    {
      id: "dock-gate",
      label: "站台联动栅门",
      edge: ["B2", "B3"] as [string, string],
      control: "plate" as const,
    },
    {
      id: "scale-gate",
      label: "地磅联动栅门",
      edge: ["C2", "C3"] as [string, string],
      control: "plate" as const,
    },
  ],
  plates: [
    {
      id: "west-scale",
      label: "西地磅（认铁锭）",
      nodes: ["X", "P"],
      accept: "iron" as const,
      doorIds: ["scale-gate"],
    },
    {
      id: "dock-plate",
      label: "站台载重踏板",
      nodes: ["B1"],
      accept: "any" as const,
      doorIds: ["dock-gate"],
    },
  ],
  vehicles: [
    { id: "loco", code: "调0", name: "老式调车机", role: "loco" as const, load: 40, color: "#b56a32" },
    { id: "carC", code: "丙", name: "丙号玻璃车", role: "wagon" as const, cargo: "glass" as const, load: 12, color: "#7ec8c8" },
    { id: "carB", code: "乙", name: "乙号铁锭车", role: "wagon" as const, cargo: "iron" as const, load: 30, color: "#8a93a0" },
    { id: "carA", code: "甲", name: "甲号木材车", role: "wagon" as const, cargo: "timber" as const, load: 22, color: "#7d9b6a" },
  ],
};

function makeLevel(partial: Pick<LevelDef, "id" | "name" | "title" | "brief" | "maxSteps" | "station" | "plan" | "guide"> & {
  doors?: Record<string, boolean>;
}): LevelDef {
  const { doors: initialDoors, ...meta } = partial;
  return {
    ...yardGeometry,
    ...meta,
    start: makeStart(initialDoors),
  };
}

export const LEVELS: LevelDef[] = [
  makeLevel({
    id: "branch-return",
    name: "岔线回执",
    title: "推进短列入岔，再沿旧轨倒拖",
    brief:
      "订单为西端读入 丙·乙·甲。先扳道岔，把甲端先导的短列推进岔线；此时扳岔会被拒。换向后由机车端倒拖，车尾会沿进来时压过的轨逐格退回，再完成站台交付。",
    maxSteps: 18,
    station: {
      label: "东站台",
      entryEnd: "w",
      entryNode: "E",
      berths: ["B1", "B2", "B3"],
      order: ["carC", "carB", "carA"],
    },
    plan: BRANCH_RETURN_PLAN,
    guide: [
      "单调按已验证调车单逐手演练，也可自由扳岔、摘钩和接钩。",
      "任一节当前位置或上一手位置压着 S 岔喉时，道岔锁定。",
      "同一机车坐标与朝向下，身后车辆位置不同，可走的端路也不同。",
    ],
  }),
  makeLevel({
    id: "middle-reconsist",
    name: "中段换挂",
    title: "摘下中段乙车，从甲车另一端接回",
    brief:
      "新订单要求西端读入 丙·甲·乙。把车列推到北侧绕行线，摘下乙车并送到站台位，再分解丙—乙、让调0与甲相连，拖动甲换位后把乙挂到甲的另一端。车序、踏板负载和交货读序全部按真实新编组重算。",
    maxSteps: 14,
    station: {
      label: "东站台",
      entryEnd: "w",
      entryNode: "E",
      berths: ["B1", "B2", "B3"],
      order: ["carC", "carA", "carB"],
    },
    plan: MIDDLE_RECONSIST_PLAN,
    guide: [
      "调车单第 7 手后，乙是被摘下的中段单车。",
      "第 10 手把乙挂到甲原本未连挂的另一端，形成 调0—丙—甲—乙。",
      "踏板与站台读序不保存旧车号，只从当前真实位置和车钩数组计算。",
    ],
  }),
  makeLevel({
    id: "warehouse-door",
    name: "关门停车",
    title: "仓库门关闭时，整列不得压缩车钩",
    brief:
      "仓库门初始关闭。可先开门完成 丙·乙·甲 交付；也可直接尝试向东推甲，系统会拒绝该手并保持所有车辆坐标、上一手坐标和接钩间距不变。",
    maxSteps: 10,
    doors: { warehouse: false },
    station: {
      label: "东站台",
      entryEnd: "w",
      entryNode: "E",
      berths: ["B1", "B2", "B3"],
      order: ["carC", "carB", "carA"],
    },
    plan: DOOR_DELIVERY_PLAN,
    guide: [
      "先点“关门试推”，再对比盘面车序与车钩间距。",
      "手动打开仓库门后，调车单可逐手执行。",
      "站台踏板被车辆占用时，B2—B3 联动栅门才开放。",
    ],
  }),
];

// Keep the direct plan available for tests and quick sandboxes.
export { DIRECT_DELIVERY_PLAN };

export function getLevel(id: string): LevelDef {
  const found = LEVELS.find((level) => level.id === id);
  if (!found) throw new Error(`未知调车场景：${id}`);
  return found;
}

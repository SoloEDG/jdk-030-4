import { vehicleSpec } from "./engine";
import { DIR_LABEL, type LevelDef, type ShuntAction, type TrainState } from "./types";
import { vecDir } from "./engine";

export function actionLabel(
  level: LevelDef,
  before: TrainState,
  action: ShuntAction,
): string {
  const code = (id: string) => vehicleSpec(level, id).code;
  if (action.kind === "drive") {
    const from = level.nodes[before.pos[action.lead]];
    const to = level.nodes[action.to];
    const dir = from && to ? vecDir(from, to) : null;
    const leadIsLoco = vehicleSpec(level, action.lead).role === "loco";
    const direction = dir ? DIR_LABEL[dir] : "";
    if (leadIsLoco) return `机车端向${direction}走一格 → ${action.to}`;
    return `向${direction}调送，${code(action.lead)} 为前端 → ${action.to}`;
  }
  if (action.kind === "toggle-switch") {
    const sw = level.switches.find((item) => item.id === action.id);
    return `扳道岔：${sw?.label ?? action.id}`;
  }
  if (action.kind === "set-door") {
    const door = level.doors.find((item) => item.id === action.id);
    return `${action.open ? "打开" : "关闭"}门：${door?.label ?? action.id}`;
  }
  if (action.kind === "split") {
    return `摘钩：${code(action.a)} 与 ${code(action.b)} 分解`;
  }
  return `接钩：${code(action.a)} 与 ${code(action.b)} 连挂`;
}

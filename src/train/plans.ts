import type { ShuntAction } from "./types";

const eastToStation: ShuntAction[] = [
  { kind: "drive", lead: "carA", to: "D" },
  { kind: "drive", lead: "carA", to: "S" },
  { kind: "drive", lead: "carA", to: "E" },
  { kind: "drive", lead: "carA", to: "B1" },
  { kind: "drive", lead: "carA", to: "B2" },
  { kind: "drive", lead: "carA", to: "B3" },
];

export const DIRECT_DELIVERY_PLAN: ShuntAction[] = eastToStation;

export const DOOR_DELIVERY_PLAN: ShuntAction[] = [
  { kind: "set-door", id: "warehouse", open: true },
  ...eastToStation,
];

export const BRANCH_RETURN_PLAN: ShuntAction[] = [
  { kind: "toggle-switch", id: "sw1" },
  { kind: "drive", lead: "carA", to: "D" },
  { kind: "drive", lead: "carA", to: "S" },
  { kind: "drive", lead: "carA", to: "C1" },
  { kind: "drive", lead: "carA", to: "C2" },
  { kind: "drive", lead: "loco", to: "P" },
  { kind: "drive", lead: "loco", to: "X" },
  { kind: "drive", lead: "loco", to: "Y1" },
  { kind: "drive", lead: "loco", to: "W" },
  { kind: "toggle-switch", id: "sw1" },
  ...eastToStation,
];

export const MIDDLE_RECONSIST_PLAN: ShuntAction[] = [
  { kind: "drive", lead: "carA", to: "D" },
  { kind: "drive", lead: "carA", to: "S" },
  { kind: "drive", lead: "carA", to: "E" },
  { kind: "drive", lead: "carA", to: "N4" },
  { kind: "split", a: "carB", b: "carA" },
  { kind: "drive", lead: "carB", to: "B1" },
  { kind: "split", a: "carC", b: "carB" },
  { kind: "couple", a: "carC", b: "carA" },
  { kind: "drive", lead: "loco", to: "D" },
  { kind: "couple", a: "carB", b: "carA" },
  { kind: "drive", lead: "carB", to: "B2" },
  { kind: "drive", lead: "carB", to: "B3" },
];

export type Dir = "n" | "e" | "s" | "w";
export type SwitchRoute = "main" | "diverge";
export type CargoKind = "timber" | "iron" | "glass" | "coal" | "mail";

export interface Vec {
  x: number;
  y: number;
}

export interface VehicleSpec {
  id: string;
  code: string;
  name: string;
  role: "loco" | "wagon";
  cargo?: CargoKind;
  load: number;
  color: string;
}

export interface SwitchDef {
  id: string;
  label: string;
  at: string;
  stem: string;
  main: string;
  diverge: string;
}

export interface DoorDef {
  id: string;
  label: string;
  edge: [string, string];
  control: "manual" | "plate";
  openByDefault?: boolean;
}

export interface PlateDef {
  id: string;
  label: string;
  nodes: string[];
  accept: CargoKind | "any";
  doorIds: string[];
}

export interface StationDef {
  label: string;
  entryEnd: Dir;
  entryNode: string;
  berths: string[];
  order: string[];
}

export interface TrainState {
  /** vehicle id -> current track node */
  pos: Record<string, string>;
  /** node occupied before the latest hand; used to detect a car still across a switch */
  prev: Record<string, string>;
  /** Coupled cuts. Each inner array runs from one physical end to the other. */
  consists: string[][];
  switches: Record<string, SwitchRoute>;
  doors: Record<string, boolean>;
  facing: Record<string, Dir>;
  steps: number;
}

export interface LevelDef {
  id: string;
  name: string;
  title: string;
  brief: string;
  maxSteps: number;
  width: number;
  height: number;
  nodes: Record<string, Vec>;
  names?: Record<string, string>;
  edges: [string, string][];
  switches: SwitchDef[];
  doors: DoorDef[];
  plates: PlateDef[];
  station: StationDef;
  vehicles: VehicleSpec[];
  start: TrainState;
  plan?: ShuntAction[];
  guide: string[];
}

export type ShuntAction =
  | { kind: "drive"; lead: string; to: string }
  | { kind: "toggle-switch"; id: string }
  | { kind: "set-door"; id: string; open: boolean }
  | { kind: "split"; a: string; b: string }
  | { kind: "couple"; a: string; b: string };

export type EventTone = "info" | "success" | "warn" | "danger";

export interface HandEvent {
  tone: EventTone;
  message: string;
}

export interface ApplyResult {
  ok: boolean;
  state: TrainState;
  event: HandEvent;
}

export interface SolutionStep {
  action: ShuntAction;
  label: string;
  state: TrainState;
}

export interface Solution {
  steps: SolutionStep[];
  first?: SolutionStep;
}

export const CARGO_LABEL: Record<CargoKind, string> = {
  timber: "木材",
  iron: "铁锭",
  glass: "玻璃",
  coal: "煤炭",
  mail: "邮包",
};

export const DIR_LABEL: Record<Dir, string> = {
  n: "北",
  e: "东",
  s: "南",
  w: "西",
};

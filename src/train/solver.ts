import { actionLabel } from "./labels";
import {
  applyAction,
  cloneState,
  enumerateActions,
  isDelivered,
  stateKey,
} from "./engine";
import type { LevelDef, ShuntAction, Solution, SolutionStep, TrainState } from "./types";

interface SearchNode {
  state: TrainState;
  actions: ShuntAction[];
}

export function buildSolution(level: LevelDef, actions: ShuntAction[]): Solution {
  let state = cloneState(level.start);
  const steps: SolutionStep[] = [];
  for (const action of actions) {
    const before = state;
    const result = applyAction(level, before, action);
    if (!result.ok) throw new Error(`规划出的操作不可执行：${result.event.message}`);
    steps.push({
      action,
      label: actionLabel(level, before, action),
      state: result.state,
    });
    state = result.state;
  }
  return { steps, first: steps[0] };
}

export function searchActions(
  level: LevelDef,
  maxSteps: number = level.maxSteps,
): ShuntAction[] | null {
  const start = cloneState(level.start);
  if (isDelivered(level, start)) return [];

  const visited = new Set<string>([stateKey(start)]);
  const queue: SearchNode[] = [{ state: start, actions: [] }];
  let head = 0;

  while (head < queue.length) {
    const node = queue[head];
    head += 1;
    if (isDelivered(level, node.state)) return node.actions;
    if (node.actions.length >= maxSteps) continue;

    for (const action of enumerateActions(level, node.state)) {
      const result = applyAction(level, node.state, action);
      if (!result.ok) continue;
      const key = stateKey(result.state);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ state: result.state, actions: [...node.actions, action] });
    }
  }
  return null;
}

export function solve(level: LevelDef, maxSteps: number = level.maxSteps): Solution | null {
  const actions = searchActions(level, maxSteps);
  if (!actions) return null;
  return buildSolution(level, actions);
}

export interface WinningFirstMove {
  action: ShuntAction;
  label: string;
  remaining: number;
  solution: Solution;
}

/** Enumerate every legal first hand whose branch still reaches delivery. */
export function winningFirstMoves(
  level: LevelDef,
  maxSteps: number = level.maxSteps,
): WinningFirstMove[] {
  const out: WinningFirstMove[] = [];
  for (const action of enumerateActions(level, level.start)) {
    const first = applyAction(level, level.start, action);
    if (!first.ok) continue;
    const remainingLevel: LevelDef = {
      ...level,
      start: first.state,
      maxSteps: maxSteps - 1,
    };
    const rest = solve(remainingLevel, maxSteps - 1);
    if (rest) {
      const solution = buildSolution(level, [action, ...rest.steps.map((step) => step.action)]);
      out.push({
        action,
        label: actionLabel(level, level.start, action),
        remaining: solution.steps.length,
        solution,
      });
    }
  }
  return out;
}

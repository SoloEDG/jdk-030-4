<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import TrainBoard from "../train/TrainBoard.vue";
import {
  applyAction,
  cloneState,
  enumerateActions,
  findConsist,
  isDelivered,
  isDoorOpen,
  plateReports,
  stationReadout,
  vehicleSpec,
} from "../train/engine";
import { actionLabel } from "../train/labels";
import { LEVELS, getLevel } from "../train/levels";
import { buildSolution, searchActions } from "../train/solver";
import type { HandEvent, LevelDef, ShuntAction, TrainState } from "../train/types";
import { DIR_LABEL } from "../train/types";

const level = ref<LevelDef>(LEVELS[0]);
const live = ref<TrainState>(cloneState(level.value.start));
const past = ref<TrainState[]>([]);
const cursor = ref(0);
const rehearsing = ref(true);
const selected = ref<string | null>("carA");
const coupleArmed = ref(false);
const coupleFirst = ref<string | null>(null);
const pulse = ref(0);
const frozenProof = ref("");
const notice = ref<HandEvent>({
  tone: "info",
  message: "第一手已列在左侧调车单；可直接逐手演练，也可在盘面点车后自由调车。",
});

let timer: number | null = null;

const customActions = ref<ShuntAction[] | null>(null);
const searching = ref(false);

const plan = computed(() =>
  buildSolution(level.value, customActions.value ?? level.value.plan ?? []),
);
const view = computed<TrainState>(() => {
  if (!rehearsing.value) return live.value;
  if (cursor.value === 0) return level.value.start;
  return plan.value.steps[cursor.value - 1]?.state ?? level.value.start;
});
const legalActions = computed(() => enumerateActions(level.value, view.value));
const driveOptions = computed(() => legalActions.value.filter((a) => a.kind === "drive"));
const coupleActions = computed(() => legalActions.value.filter((a) => a.kind === "couple"));
const reports = computed(() => plateReports(level.value, view.value));
const readout = computed(() => stationReadout(level.value, view.value));
const delivered = computed(() => isDelivered(level.value, view.value));
const locoCut = computed(() => findConsist(view.value, "loco"));
const tailPath = computed(() => {
  if (!locoCut.value) return "机车已摘钩，当前不在车列中";
  return locoCut.value.cut
    .map((id) => `${vehicleSpec(level.value, id).code}@${view.value.pos[id]}`)
    .join(" — ");
});

function stopAuto(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

function resetState(): void {
  stopAuto();
  customActions.value = null;
  searching.value = false;
  live.value = cloneState(level.value.start);
  past.value = [];
  cursor.value = 0;
  rehearsing.value = true;
  selected.value = "carA";
  coupleArmed.value = false;
  coupleFirst.value = null;
  frozenProof.value = "";
  notice.value = { tone: "info", message: level.value.brief };
}

function chooseLevel(id: string): void {
  level.value = getLevel(id);
  resetState();
}

function forkFromRehearsal(): void {
  if (rehearsing.value) {
    live.value = cloneState(view.value);
    past.value = [];
    rehearsing.value = false;
  }
}

function runManual(action: ShuntAction): void {
  forkFromRehearsal();
  const before = live.value;
  const result = applyAction(level.value, before, action);
  notice.value = result.event;
  pulse.value += 1;
  if (!result.ok) {
    if (action.kind === "drive" && result.event.message.includes("关闭")) {
      frozenProof.value = "已比对：关门阻挡时引擎不改写 pos、prev 或 consists；整车仍停在原接钩间距。";
    }
    return;
  }
  frozenProof.value = "";
  past.value.push(cloneState(before));
  live.value = result.state;
  if (isDelivered(level.value, result.state)) {
    notice.value = {
      tone: "success",
      message: `交付完成：站台读序与订单一致，共用 ${result.state.steps} 手。踏板和新编组均已按当前盘面重算。`,
    };
  }
}

function undo(): void {
  const previous = past.value.pop();
  if (!previous) return;
  rehearsing.value = false;
  live.value = previous;
  notice.value = { tone: "info", message: "已撤销上一自由操作。" };
}

function showStep(nextCursor: number): void {
  stopAuto();
  cursor.value = Math.max(0, Math.min(plan.value.steps.length, nextCursor));
  rehearsing.value = true;
  const step = cursor.value > 0 ? plan.value.steps[cursor.value - 1] : null;
  notice.value = step
    ? { tone: "info", message: `第 ${cursor.value} 手：${step.label}` }
    : { tone: "info", message: "已回到初始盘面。" };
  if (cursor.value === plan.value.steps.length && delivered.value) {
    notice.value = {
      tone: "success",
      message: `逐手演练完成：${plan.value.steps.length} 手内完成交付，未超过 ${level.value.maxSteps} 手限额。`,
    };
  }
}

function togglePlay(): void {
  if (timer !== null) {
    stopAuto();
    return;
  }
  if (cursor.value >= plan.value.steps.length) cursor.value = 0;
  rehearsing.value = true;
  timer = window.setInterval(() => {
    cursor.value += 1;
    rehearsing.value = true;
    if (cursor.value >= plan.value.steps.length) {
      stopAuto();
      notice.value = { tone: "success", message: "自动演练到交付末手。可点任意步骤回看。" };
    } else {
      const step = plan.value.steps[cursor.value - 1];
      if (step) notice.value = { tone: "info", message: `第 ${cursor.value} 手：${step.label}` };
    }
  }, 1500);
}

async function runBfs(): Promise<void> {
  if (searching.value) return;
  stopAuto();
  searching.value = true;
  const target = level.value;
  notice.value = { tone: "info", message: "正在穷举端路、道岔、摘钩和接钩，寻找限额内的一手方案……" };
  await new Promise((resolve) => window.setTimeout(resolve, 40));
  try {
    const actions = searchActions(target, target.maxSteps);
    if (level.value.id !== target.id) return;
    if (!actions) {
      notice.value = { tone: "warn", message: `BFS 在 ${level.value.maxSteps} 手限额内没有找到交付方案。` };
      return;
    }
    customActions.value = actions;
    cursor.value = 0;
    rehearsing.value = true;
    notice.value = { tone: "success", message: `BFS 找到 ${actions.length} 手可交付方案；第一手和全单已列出。` };
  } finally {
    searching.value = false;
  }
}

function restoreScriptedPlan(): void {
  customActions.value = null;
  cursor.value = 0;
  rehearsing.value = true;
  notice.value = { tone: "info", message: "已恢复为覆盖岔线 / 换挂机制的教学调车单。" };
}

function onVehicle(id: string): void {
  if (!coupleArmed.value) {
    selected.value = selected.value === id ? null : id;
    return;
  }
  if (!coupleFirst.value) {
    coupleFirst.value = id;
    return;
  }
  if (coupleFirst.value === id) {
    coupleFirst.value = null;
    return;
  }
  const first = coupleFirst.value;
  coupleFirst.value = null;
  coupleArmed.value = false;
  runManual({ kind: "couple", a: first, b: id });
}

function onNode(nodeId: string): void {
  if (!selected.value) {
    notice.value = { tone: "info", message: "先点一辆端车，再点相邻轨道节点；也可直接使用下方端路按钮。" };
    return;
  }
  // Send the attempt through the engine even when it is illegal, so a closed
  // door or occupied leg produces the exact “whole train stays put” feedback.
  runManual({ kind: "drive", lead: selected.value, to: nodeId });
}

function toggleDoor(doorId: string, currentlyOpen: boolean): void {
  runManual({ kind: "set-door", id: doorId, open: !currentlyOpen });
}

function probeClosedDoor(): void {
  chooseLevel("warehouse-door");
  const blocked = applyAction(level.value, level.value.start, {
    kind: "drive",
    lead: "carA",
    to: "D",
  });
  notice.value = blocked.event;
  frozenProof.value = "初始快照试推：返回失败且未执行任何赋值，四辆车坐标、prev 与车钩数组完全不变。";
  pulse.value += 1;
}

function probeSwitchLock(): void {
  chooseLevel("branch-return");
  cursor.value = 5;
  rehearsing.value = true;
  const lockedState = plan.value.steps[4]?.state ?? level.value.start;
  const blocked = applyAction(level.value, lockedState, { kind: "toggle-switch", id: "sw1" });
  notice.value = blocked.event;
  pulse.value += 1;
}

function probeMiddle(): void {
  chooseLevel("middle-reconsist");
  showStep(10);
}

const KEY_DIR: Record<string, "n" | "e" | "s" | "w"> = {
  ArrowUp: "n",
  ArrowRight: "e",
  ArrowDown: "s",
  ArrowLeft: "w",
  w: "n",
  d: "e",
  s: "s",
  a: "w",
};

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName)) return;
  const dir = KEY_DIR[event.key];
  if (!dir) {
    if (event.key === "r" || event.key === "R") resetState();
    return;
  }
  event.preventDefault();
  const action = driveOptions.value.find((candidate) =>
    actionLabel(level.value, view.value, candidate).includes(DIR_LABEL[dir]),
  );
  if (action) runManual(action);
  else {
    forkFromRehearsal();
    notice.value = {
      tone: "warn",
      message: "这个方向没有安全端路：可能被车占用、门关闭、道岔未开通，或尾车进路不通。",
    };
  }
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  stopAuto();
});
</script>

<template>
  <div class="train-app">
    <header class="topbar">
      <div class="brand">
        <span class="logo">调</span>
        <div>
          <h1>老式调车机工房</h1>
          <p>窄轨穿库 · 扳岔锁定 · 按单进站 · 真实新编组与踏板负载</p>
        </div>
      </div>
      <div class="quick-probes">
        <button type="button" @click="probeSwitchLock">看跨岔禁扳瞬间</button>
        <button type="button" @click="probeClosedDoor">看关门整列停车</button>
        <button type="button" @click="probeMiddle">看中段另一端接回</button>
      </div>
      <p class="notice" :data-tone="notice.tone" :key="pulse">{{ notice.message }}</p>
    </header>

    <div class="layout">
      <aside class="left-column">
        <section class="panel">
          <h2>调车场景</h2>
          <div class="level-list">
            <button
              v-for="item in LEVELS"
              :key="item.id"
              type="button"
              class="level-button"
              :class="{ current: item.id === level.id }"
              @click="chooseLevel(item.id)"
            >
              <strong>{{ item.name }}</strong>
              <span>{{ item.maxSteps }} 手限额 · 单调 {{ item.plan?.length ?? 0 }} 手</span>
            </button>
          </div>
        </section>

        <section class="panel plan-panel">
          <div class="panel-title-row">
            <h2>能完成交付的调车单</h2>
            <span class="plan-count">{{ plan.steps.length }} 手</span>
          </div>
          <div class="solver-row">
            <button type="button" class="primary" :disabled="searching" @click="runBfs">
              {{ searching ? "搜索中…" : "BFS 重列最短单" }}
            </button>
            <button v-if="customActions" type="button" @click="restoreScriptedPlan">恢复教学单</button>
          </div>
          <div v-if="plan.first" class="first-hand">
            <span>第一手</span>
            <strong>{{ plan.first.label }}</strong>
          </div>
          <ol class="step-list">
            <li
              v-for="(step, index) in plan.steps"
              :key="index"
              :class="{ active: rehearsing && cursor === index + 1, done: rehearsing && cursor > index + 1 }"
            >
              <button type="button" @click="showStep(index + 1)">
                <b>{{ index + 1 }}</b>
                <span>{{ step.label }}</span>
              </button>
            </li>
          </ol>
          <p v-if="!plan.steps.length" class="empty">本场景没有预置调车单。</p>
        </section>
      </aside>

      <main class="center-column">
        <section class="panel stage-panel">
          <div class="stage-heading">
            <div>
              <h2>{{ level.title }}</h2>
              <p>{{ level.brief }}</p>
            </div>
            <div class="meter" :class="{ over: view.steps > level.maxSteps, won: delivered }">
              <strong>{{ view.steps }}</strong>
              <span>/ {{ level.maxSteps }} 手</span>
            </div>
          </div>

          <TrainBoard
            :level="level"
            :state="view"
            :selected="selected"
            :couple-first="coupleFirst"
            :drive-options="driveOptions"
            @node="onNode"
            @vehicle="onVehicle"
            @switch="(id) => runManual({ kind: 'toggle-switch', id })"
          />

          <p v-if="frozenProof" class="frozen-proof">{{ frozenProof }}</p>

          <div class="rehearsal-bar">
            <button type="button" @click="showStep(cursor - 1)" :disabled="cursor === 0">上一手</button>
            <button type="button" class="primary" @click="showStep(cursor + 1)" :disabled="cursor >= plan.steps.length">下一手</button>
            <button type="button" @click="togglePlay">{{ timer === null ? "自动逐手演练" : "暂停" }}</button>
            <button type="button" @click="showStep(0)">回到起手</button>
            <button type="button" @click="forkFromRehearsal">从当前手自由接车</button>
            <button type="button" @click="undo" :disabled="!past.length">撤销自由手</button>
            <button type="button" class="reset" @click="resetState">重置</button>
          </div>
        </section>

        <section class="panel controls-panel">
          <h2>本态可执行的端路 / 摘挂</h2>
          <div class="control-grid">
            <div class="control-block">
              <h3>移动端路（点绿圈或按钮）</h3>
              <div class="chip-row">
                <button
                  v-for="action in driveOptions"
                  :key="`${action.kind}-${action.lead}-${action.to}`"
                  type="button"
                  class="action-chip drive"
                  @click="runManual(action)"
                >
                  {{ actionLabel(level, view, action) }}
                </button>
                <span v-if="!driveOptions.length" class="empty">当前没有合法端路；可能被关门、道岔或尽头线限制。</span>
              </div>
            </div>

            <div class="control-block">
              <h3>摘钩（盘面车序中的车钩）</h3>
              <div class="consist-list">
                <div v-for="(cut, cutIndex) in view.consists" :key="cutIndex" class="consist-cut">
                  <template v-for="(id, index) in cut" :key="id">
                    <button
                      type="button"
                      class="vehicle-chip"
                      :class="[vehicleSpec(level, id).role, { selected: selected === id }]"
                      @click="onVehicle(id)"
                    >
                      {{ vehicleSpec(level, id).code }}
                    </button>
                    <button
                      v-if="index < cut.length - 1"
                      type="button"
                      class="coupler"
                      title="摘开这个车钩"
                      @click="runManual({ kind: 'split', a: id, b: cut[index + 1] })"
                    >
                      摘✂
                    </button>
                  </template>
                </div>
              </div>
            </div>

            <div class="control-block">
              <h3>接钩（仅相邻两个车列端可接）</h3>
              <div class="chip-row">
                <button type="button" :class="{ active: coupleArmed }" @click="coupleArmed = !coupleArmed">
                  {{ coupleArmed ? "再点两个端车" : "进入点选接钩" }}
                </button>
                <button
                  v-for="action in coupleActions"
                  :key="`${action.kind}-${action.a}-${action.b}`"
                  type="button"
                  class="action-chip couple"
                  @click="runManual(action)"
                >
                  {{ actionLabel(level, view, action) }}
                </button>
              </div>
            </div>

            <div class="control-block">
              <h3>库门 / 道岔</h3>
              <div class="chip-row">
                <button
                  v-for="door in level.doors.filter((d) => d.control === 'manual')"
                  :key="door.id"
                  type="button"
                  class="action-chip door"
                  @click="toggleDoor(door.id, isDoorOpen(level, view, door.id))"
                >
                  {{ door.label }}：{{ isDoorOpen(level, view, door.id) ? "开，点关" : "关，点开" }}
                </button>
                <button
                  v-for="sw in level.switches"
                  :key="sw.id"
                  type="button"
                  class="action-chip switch"
                  @click="runManual({ kind: 'toggle-switch', id: sw.id })"
                >
                  扳{{ sw.label }}（当前{{ view.switches[sw.id] === "main" ? "直股" : "岔股" }}）
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <aside class="right-column">
        <section class="panel">
          <h2>真实盘面车序</h2>
          <p class="signature">{{ tailPath }}</p>
          <div v-for="(cut, index) in view.consists" :key="index" class="order-line">
            <span>车列 {{ index + 1 }}</span>
            <strong>{{ cut.map((id) => vehicleSpec(level, id).code).join(" — ") }}</strong>
          </div>
          <p class="hint">车头 {{ view.pos.loco }} · 朝向 {{ DIR_LABEL[view.facing.loco] }}。即使坐标朝向相同，上方尾路不同，下一手可走的端路也会不同。</p>
        </section>

        <section class="panel">
          <h2>踏板负载</h2>
          <ul class="plate-list">
            <li v-for="report in reports" :key="report.plate.id" :class="{ powered: report.powered }">
              <strong>{{ report.plate.label }}</strong>
              <span>
                {{ report.vehicleIds.length ? report.vehicleIds.map((id) => `${vehicleSpec(level, id).code}(${vehicleSpec(level, id).load}t)`).join("、") : "空板" }}
                · 总负载 {{ report.totalLoad }}t
              </span>
              <em>{{ report.powered ? "负载匹配 / 踏板落下" : "未供电" }}</em>
            </li>
          </ul>
        </section>

        <section class="panel delivery-panel" :class="{ won: delivered }">
          <h2>站台交货次序</h2>
          <div class="delivery-row">
            <div v-for="(id, index) in readout" :key="index" class="delivery-cell" :class="{ ok: id === level.station.order[index] }">
              <small>{{ level.station.entryEnd === "w" ? "西端起" : "指定端起" }} {{ index + 1 }}</small>
              <strong>{{ id ? vehicleSpec(level, id).code : "空" }}</strong>
              <em>应 {{ vehicleSpec(level, level.station.order[index]).code }}</em>
            </div>
          </div>
          <p class="delivery-status">{{ delivered ? "次序正确，交付完成" : "尚未按订单次序停齐" }}</p>
        </section>

        <section class="panel guide-panel">
          <h2>操作要点</h2>
          <ul>
            <li v-for="line in level.guide" :key="line">{{ line }}</li>
            <li>键盘：方向键 / WASD 找合法端路，R 重置。</li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

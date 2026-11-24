<script setup lang="ts">
import { computed } from "vue";
import {
  adjacentNodes,
  findConsist,
  isDoorOpen,
  plateReports,
  switchStraddledBy,
} from "./engine";
import type { LevelDef, ShuntAction, TrainState, Vec } from "./types";

const props = defineProps<{
  level: LevelDef;
  state: TrainState;
  selected: string | null;
  coupleFirst: string | null;
  driveOptions: ShuntAction[];
}>();

const emit = defineEmits<{
  (e: "node", id: string): void;
  (e: "vehicle", id: string): void;
  (e: "switch", id: string): void;
}>();

const CELL = 84;
const PAD = 48;

function point(id: string): { x: number; y: number } {
  const v: Vec = props.level.nodes[id] ?? { x: 0, y: 0 };
  return { x: PAD + v.x * CELL, y: PAD + v.y * CELL };
}

const viewBox = computed(() => `0 0 ${props.level.width * CELL} ${props.level.height * CELL}`);

const reports = computed(() => plateReports(props.level, props.state));

const lockedSwitch = computed(() => {
  const sw = props.level.switches[0];
  return sw ? switchStraddledBy(props.level, props.state, sw) : null;
});

function switchEdgeState(a: string, b: string): "active" | "inactive" | "normal" {
  const sw = props.level.switches[0];
  if (!sw) return "normal";
  const isSwitchEdge =
    (a === sw.at && (b === sw.main || b === sw.diverge)) ||
    (b === sw.at && (a === sw.main || a === sw.diverge));
  if (!isSwitchEdge) return "normal";
  const leg = a === sw.at ? b : a;
  const selectedLeg = props.state.switches[sw.id] === "main" ? sw.main : sw.diverge;
  return leg === selectedLeg ? "active" : "inactive";
}

function doorTransform(a: string, b: string) {
  const pa = point(a);
  const pb = point(b);
  const mx = (pa.x + pb.x) / 2;
  const my = (pa.y + pb.y) / 2;
  const angle = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
  return `translate(${mx} ${my}) rotate(${angle})`;
}

function vehicleAngle(id: string): number {
  const currentId = props.state.pos[id];
  const prevId = props.state.prev[id] ?? currentId;
  const from = props.level.nodes[prevId];
  const to = props.level.nodes[currentId];
  if (!from || !to) return 0;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1) return 0;
  if (dx === -1) return 180;
  if (dy === 1) return 90;
  if (dy === -1) return -90;
  return 0;
}

const targetNodes = computed(() => {
  if (!props.selected) return new Set<string>();
  return new Set(
    props.driveOptions
      .filter((action): action is Extract<ShuntAction, { kind: "drive" }> => action.kind === "drive" && action.lead === props.selected)
      .map((action) => action.to),
  );
});

const attemptNodes = computed(() => {
  if (!props.selected) return new Set<string>();
  const located = findConsist(props.state, props.selected);
  if (!located || (located.index !== 0 && located.index !== located.cut.length - 1)) {
    return new Set<string>();
  }
  return new Set(adjacentNodes(props.level, props.state.pos[props.selected]));
});

function spec(id: string) {
  const found = props.level.vehicles.find((v) => v.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

const orderedVehicles = computed(() =>
  Object.keys(props.state.pos).map((id) => ({ id, ...point(props.state.pos[id]) })),
);

const stationPoints = computed(() => props.level.station.berths.map((id) => ({ id, ...point(id) })));
</script>

<template>
  <svg class="board-svg" :viewBox="viewBox" role="img" :aria-label="`${level.title}调车盘面`">
    <!-- warehouse and platform -->
    <rect
      x="250"
      y="246"
      width="252"
      height="112"
      rx="4"
      class="warehouse-shape"
    />
    <text x="376" y="236" text-anchor="middle" class="map-label warehouse-label">窄轨仓库</text>
    <rect x="588" y="244" width="276" height="112" rx="10" class="platform-shape" />
    <text x="726" y="236" text-anchor="middle" class="map-label platform-label">{{ level.station.label }} · {{ level.station.entryEnd === "w" ? "西端进站" : "指定端进站" }}</text>

    <!-- plates -->
    <g v-for="report in reports" :key="report.plate.id">
      <template v-for="nodeId in report.plate.nodes" :key="nodeId">
        <rect
          :x="point(nodeId).x - 29"
          :y="point(nodeId).y - 20"
          width="58"
          height="40"
          rx="8"
          class="plate-shape"
          :class="{ powered: report.powered }"
        />
      </template>
      <text
        :x="point(report.plate.nodes[0]).x"
        :y="point(report.plate.nodes[0]).y - 30"
        text-anchor="middle"
        class="plate-label"
        :class="{ powered: report.powered }"
      >
        {{ report.plate.label }} · {{ report.totalLoad }}t
      </text>
    </g>

    <!-- rail bed -->
    <g v-for="([a, b], index) in level.edges" :key="`edge-${index}`">
      <line
        :x1="point(a).x"
        :y1="point(a).y"
        :x2="point(b).x"
        :y2="point(b).y"
        class="rail-bed"
      />
      <line
        :x1="point(a).x"
        :y1="point(a).y"
        :x2="point(b).x"
        :y2="point(b).y"
        class="rail-top"
      />
      <line
        v-if="switchEdgeState(a, b) !== 'normal'"
        :x1="point(a).x"
        :y1="point(a).y"
        :x2="point(b).x"
        :y2="point(b).y"
        class="switch-route"
        :class="switchEdgeState(a, b)"
      />
    </g>

    <!-- station order chips beneath berths -->
    <g v-for="(node, index) in stationPoints" :key="`order-${node.id}`">
      <rect :x="node.x - 25" :y="node.y + 31" width="50" height="24" rx="12" class="order-slot" />
      <text :x="node.x" :y="node.y + 48" text-anchor="middle" class="order-text">
        单{{ index + 1 }} · {{ spec(level.station.order[index]).code }}
      </text>
    </g>

    <!-- doors -->
    <g v-for="door in level.doors" :key="door.id" :transform="doorTransform(door.edge[0], door.edge[1])">
      <rect
        x="-5"
        y="-19"
        width="10"
        height="38"
        rx="2"
        class="door-shape"
        :class="{ open: isDoorOpen(level, state, door.id), plate: door.control === 'plate' }"
      />
      <text x="0" y="-27" text-anchor="middle" class="door-label" transform="rotate(0)">
        {{ door.label }}{{ isDoorOpen(level, state, door.id) ? "·开" : "·关" }}
      </text>
    </g>

    <!-- switch machine -->
    <g
      v-for="sw in level.switches"
      :key="sw.id"
      class="switch-machine"
      @click.stop="emit('switch', sw.id)"
    >
      <circle :cx="point(sw.at).x" :cy="point(sw.at).y" r="20" class="switch-hit" />
      <circle
        :cx="point(sw.at).x"
        :cy="point(sw.at).y"
        r="13"
        class="switch-dot"
        :class="{ locked: !!lockedSwitch }"
      />
      <text :x="point(sw.at).x" :y="point(sw.at).y + 5" text-anchor="middle" class="switch-text">岔</text>
      <text :x="point(sw.at).x" :y="point(sw.at).y - 24" text-anchor="middle" class="switch-label">
        {{ sw.label }}·{{ state.switches[sw.id] === "main" ? "直" : "岔" }}{{ lockedSwitch ? "·锁" : "" }}
      </text>
    </g>

    <!-- node hit areas and legal targets -->
    <g v-for="nodeId in Object.keys(level.nodes)" :key="`node-${nodeId}`">
      <circle
        :cx="point(nodeId).x"
        :cy="point(nodeId).y"
        r="25"
        class="node-hit"
        @click.stop="emit('node', nodeId)"
      />
      <circle
        v-if="attemptNodes.has(nodeId)"
        :cx="point(nodeId).x"
        :cy="point(nodeId).y"
        r="16"
        class="attempt-ring"
        :class="{ legal: targetNodes.has(nodeId), blocked: !targetNodes.has(nodeId) }"
        @click.stop="emit('node', nodeId)"
      />
    </g>

    <!-- vehicles -->
    <g
      v-for="vehicle in orderedVehicles"
      :key="vehicle.id"
      :transform="`translate(${vehicle.x} ${vehicle.y}) rotate(${vehicleAngle(vehicle.id)})`"
      class="vehicle"
      :class="{
        selected: selected === vehicle.id,
        couple: coupleFirst === vehicle.id,
        loco: spec(vehicle.id).role === 'loco',
      }"
      @click.stop="emit('vehicle', vehicle.id)"
    >
      <rect x="-29" y="-16" width="58" height="32" rx="7" :fill="spec(vehicle.id).color" class="vehicle-body" />
      <rect v-if="spec(vehicle.id).role === 'loco'" x="-23" y="-22" width="15" height="10" rx="2" :fill="spec(vehicle.id).color" />
      <circle v-if="spec(vehicle.id).role === 'loco'" cx="17" cy="-3" r="5" fill="#2a2118" opacity="0.55" />
      <text x="0" y="6" text-anchor="middle" class="vehicle-code">{{ spec(vehicle.id).code }}</text>
      <text v-if="selected === vehicle.id" x="0" y="-24" text-anchor="middle" class="selected-tag">先导</text>
    </g>
  </svg>
</template>

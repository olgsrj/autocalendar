<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import {
  currentMileage,
  activeMaintenanceRules,
  activeServiceEvents,
  activeParts,
  activeMiscExpenses,
  activeMaintenanceSubTab,
  highlightedRuleId,
  isServiceModalOpen,
  editingServiceEvent,
  deleteServiceEvent,
  deleteMiscExpense,
  loadAllData,
  showToast
} from '../services/store';
import {
  formatKm,
  formatCurrency,
  formatDateRu,
  formatDurationRu
} from '../services/calculations';
import type { MaintenanceRule, ServiceEvent, MiscExpense } from '../types';
import { db } from '../db';
import MaintenanceRuleModal from '../components/MaintenanceRuleModal.vue';
import LinkRuleToServiceModal from '../components/LinkRuleToServiceModal.vue';
import MiscServiceModal from '../components/MiscServiceModal.vue';
import {
  Wrench,
  ClipboardList,
  Disc,
  Plus,
  Edit2,
  Trash2,
  Bell,
  BellOff,
  CheckCircle2,
  Search,
  Building2,
  MapPin,
  Package,
  ChevronDown,
  ChevronUp
} from 'lucide-vue-next';

// Subtab control is in store: activeMaintenanceSubTab ('rules' | 'repairs' | 'other')

// --- TAB 1: RULES ---
const ruleFilterStatus = ref<'all' | 'overdue' | 'urgent' | 'ok'>('all');
const isRuleModalOpen = ref(false);
const editingRule = ref<MaintenanceRule | null>(null);
const ruleForLinkModal = ref<MaintenanceRule | null>(null);
const isLinkModalOpen = ref(false);
const expandedHistoryRuleId = ref<string | null>(null);

watch(highlightedRuleId, async ruleId => {
  if (!ruleId) return;
  ruleFilterStatus.value = 'all';
  expandedHistoryRuleId.value = ruleId;
  await nextTick();
  setTimeout(() => document.getElementById(`confirm-rule-${ruleId}`)?.focus({ preventScroll: true }), 180);
}, { immediate: true });

interface RuleStatusMeta {
  isOverdueKm: boolean;
  isUrgentKm: boolean;
  remainingKm: number | null;
  isOverdueDays: boolean;
  isUrgentDays: boolean;
  remainingDays: number | null;
  overallStatus: 'overdue' | 'urgent' | 'ok';
  predictedDate: string | null;
}

const ruleStatusMap = computed(() => {
  const map: Record<string, RuleStatusMeta> = {};
  const curKm = currentMileage.value;
  const today = new Date().toISOString().split('T')[0];

  for (const rule of activeMaintenanceRules.value) {
    let isOverdueKm = false;
    let isUrgentKm = false;
    let remainingKm: number | null = null;

    if (rule.intervalKm && rule.lastReplacedKm) {
      remainingKm = rule.lastReplacedKm + rule.intervalKm - curKm;
      if (remainingKm < 0) isOverdueKm = true;
      else if (remainingKm <= 1000) isUrgentKm = true;
    }

    let isOverdueDays = false;
    let isUrgentDays = false;
    let remainingDays: number | null = null;
    let predictedDate: string | null = null;

    if (rule.intervalDays && rule.lastReplacedDate) {
      const start = new Date(rule.lastReplacedDate).getTime();
      const nextDate = start + rule.intervalDays * 24 * 3600 * 1000;
      remainingDays = Math.ceil((nextDate - new Date(today).getTime()) / (24 * 3600 * 1000));
      if (remainingDays < 0) isOverdueDays = true;
      else if (remainingDays <= 30) isUrgentDays = true;

      predictedDate = new Date(nextDate).toLocaleDateString('ru-RU');
    }

    let overallStatus: 'overdue' | 'urgent' | 'ok' = 'ok';
    if (isOverdueKm || isOverdueDays) overallStatus = 'overdue';
    else if (isUrgentKm || isUrgentDays) overallStatus = 'urgent';

    map[rule.id] = {
      isOverdueKm,
      isUrgentKm,
      remainingKm,
      isOverdueDays,
      isUrgentDays,
      remainingDays,
      overallStatus,
      predictedDate
    };
  }
  return map;
});

const rulesCounts = computed(() => {
  let overdue = 0;
  let urgent = 0;
  let ok = 0;
  for (const meta of Object.values(ruleStatusMap.value)) {
    if (meta.overallStatus === 'overdue') overdue++;
    else if (meta.overallStatus === 'urgent') urgent++;
    else ok++;
  }
  return { all: activeMaintenanceRules.value.length, overdue, urgent, ok };
});

const filteredRules = computed(() => {
  return activeMaintenanceRules.value.filter(r => {
    if (ruleFilterStatus.value === 'all') return true;
    const meta = ruleStatusMap.value[r.id];
    return meta?.overallStatus === ruleFilterStatus.value;
  });
});

async function toggleNotify(rule: MaintenanceRule) {
  const newVal = !rule.notifyEnabled;
  await db.maintenanceRules.update(rule.id, { notifyEnabled: newVal });
  await loadAllData();
  showToast(newVal ? 'Уведомления включены' : 'Уведомления отключены');
}

function openAddRule() {
  editingRule.value = null;
  isRuleModalOpen.value = true;
}

function openEditRule(rule: MaintenanceRule) {
  editingRule.value = rule;
  isRuleModalOpen.value = true;
}

async function deleteRule(id: string) {
  await db.maintenanceRules.delete(id);
  await loadAllData();
  showToast('Узел ТО удален');
}

function openConfirmService(rule: MaintenanceRule) {
  ruleForLinkModal.value = rule;
  isLinkModalOpen.value = true;
}

function getPastEventsForRule(ruleId: string) {
  return activeServiceEvents.value.filter(event => event.items.some(item => item.maintenanceRuleId === ruleId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.mileage || 0) - (a.mileage || 0));
}

// --- TAB 2: REPAIRS ---
const repairSearchQuery = ref('');
const repairFilterYear = ref('all');
const repairFilterOrg = ref('all');
const highlightedOrderId = ref<string | null>(null);
const expandedWorkOrderIds = ref<string[]>([]);
const orderPendingDeletion = ref<ServiceEvent | null>(null);
const miscPendingDeletion = ref<OtherItem | null>(null);
const servicePhotos = ref<Record<string, string>>({});
const lightboxPhoto = ref<string | null>(null);
const lightboxZoom = ref(1);

watch(activeServiceEvents, async events => {
  const ids = [...new Set(events.flatMap(event => event.photoIds || []))];
  const photos = await db.photos.bulkGet(ids);
  const result: Record<string, string> = {};
  photos.forEach(photo => {
    if (photo) result[photo.id] = photo.dataUrl;
  });
  servicePhotos.value = result;
}, { immediate: true });

async function navigateToOrder(orderId: string) {
  activeMaintenanceSubTab.value = 'repairs';
  repairSearchQuery.value = '';
  repairFilterYear.value = 'all';
  repairFilterOrg.value = 'all';
  highlightedOrderId.value = orderId;
  await nextTick();
  setTimeout(() => document.getElementById(`order-card-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
  setTimeout(() => { highlightedOrderId.value = null; }, 3500);
}

function getOrderPartsCost(order: ServiceEvent) {
  return order.attachedPartIds.reduce((sum, id) => sum + (activeParts.value.find(part => part.id === id)?.totalPrice || 0), 0);
}

function visibleWorks(order: ServiceEvent) {
  return expandedWorkOrderIds.value.includes(order.id) ? order.items : order.items.slice(0, 3);
}

function toggleWorks(orderId: string) {
  expandedWorkOrderIds.value = expandedWorkOrderIds.value.includes(orderId)
    ? expandedWorkOrderIds.value.filter(id => id !== orderId)
    : [...expandedWorkOrderIds.value, orderId];
}

function openLightbox(photo: string) {
  lightboxPhoto.value = photo;
  lightboxZoom.value = 1;
}

async function confirmDeleteOrder(returnParts: boolean) {
  if (!orderPendingDeletion.value) return;
  await deleteServiceEvent(orderPendingDeletion.value.id, returnParts);
  orderPendingDeletion.value = null;
}

const repairYears = computed(() => {
  const years = new Set<string>();
  for (const s of activeServiceEvents.value) {
    if (s.date) years.add(s.date.split('-')[0]);
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
});

const repairOrgs = computed(() => {
  const orgs = new Set<string>();
  for (const s of activeServiceEvents.value) {
    if (s.organization) orgs.add(s.organization);
  }
  return Array.from(orgs);
});

const filteredServiceEvents = computed(() => {
  let list = [...activeServiceEvents.value];

  if (repairSearchQuery.value.trim()) {
    const q = repairSearchQuery.value.toLowerCase().trim();
    list = list.filter(s => {
      const matchOrg = s.organization.toLowerCase().includes(q);
      const matchWork = s.items.some(i => i.name.toLowerCase().includes(q));
      const matchPart = s.attachedPartIds.some(pid => {
        const p = activeParts.value.find(part => part.id === pid);
        return p && (p.name.toLowerCase().includes(q) || (p.partNumber && p.partNumber.toLowerCase().includes(q)));
      });
      return matchOrg || matchWork || matchPart;
    });
  }

  if (repairFilterYear.value !== 'all') {
    list = list.filter(s => s.date.startsWith(repairFilterYear.value));
  }

  if (repairFilterOrg.value !== 'all') {
    list = list.filter(s => s.organization === repairFilterOrg.value);
  }

  // Sort descending by mileage and date
  return list.sort((a, b) => {
    if ((b.mileage || 0) !== (a.mileage || 0)) return (b.mileage || 0) - (a.mileage || 0);
    return b.date.localeCompare(a.date);
  });
});

const repairTotals = computed(() => {
  const labor = filteredServiceEvents.value.reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);
  let partsCost = 0;
  for (const s of filteredServiceEvents.value) {
    for (const pid of s.attachedPartIds) {
      const p = activeParts.value.find(part => part.id === pid);
      if (p) partsCost += p.totalPrice || 0;
    }
  }
  return { labor, parts: partsCost, total: labor + partsCost };
});

function openNewRepair() {
  editingServiceEvent.value = null;
  isServiceModalOpen.value = true;
}

function openEditRepair(s: ServiceEvent) {
  editingServiceEvent.value = s;
  isServiceModalOpen.value = true;
}

// --- TAB 3: OTHER (Care, Wash, Detailing) ---
const otherTagFilter = ref<'all' | 'tire' | 'wash' | 'detailing'>('all');
const isMiscServiceModalOpen = ref(false);
const editingOtherService = ref<ServiceEvent | null>(null);
const editingOtherMisc = ref<MiscExpense | null>(null);

interface OtherItem {
  id: string;
  source: 'service' | 'misc';
  category: 'tire' | 'wash' | 'detailing';
  date: string;
  mileage?: number | null;
  title: string;
  organization?: string | null;
  address?: string | null;
  cost: number;
  serviceEvent?: ServiceEvent;
  miscExpense?: MiscExpense;
}

const otherItems = computed<OtherItem[]>(() => {
  const items: OtherItem[] = [];
  for (const service of activeServiceEvents.value) {
    const isTire = service.items.some(item => /шиномонтаж|балансировка/i.test(item.name));
    const isDetailing = service.items.some(item => /полировка|покраска|детейлинг|тонировка|пл[её]нка|химчистка/i.test(item.name));
    if (!isTire && !isDetailing) continue;
    items.push({
      id: `svc-${service.id}`,
      source: 'service',
      category: isTire ? 'tire' : 'detailing',
      date: service.date,
      mileage: service.mileage,
      title: service.items.map(item => item.name).join(', '),
      organization: service.organization,
      address: service.address,
      cost: service.totalLaborCost,
      serviceEvent: service
    });
  }
  for (const misc of activeMiscExpenses.value) {
    if (misc.type === 'Мойка' || /мойка|химчистка/i.test(misc.name)) {
      items.push({
        id: `misc-${misc.id}`,
        source: 'misc',
        category: 'wash',
        date: misc.date,
        mileage: misc.mileage,
        title: misc.name,
        organization: misc.organization || 'Мойка',
        address: misc.address,
        cost: misc.cost,
        miscExpense: misc
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || (b.mileage || 0) - (a.mileage || 0));
});

const filteredOtherItems = computed(() => otherTagFilter.value === 'all'
  ? otherItems.value
  : otherItems.value.filter(item => item.category === otherTagFilter.value));

function openNewOtherItem() {
  editingOtherService.value = null;
  editingOtherMisc.value = null;
  isMiscServiceModalOpen.value = true;
}

function openEditOtherItem(item: OtherItem) {
  editingOtherService.value = item.serviceEvent || null;
  editingOtherMisc.value = item.miscExpense || null;
  isMiscServiceModalOpen.value = true;
}

function requestDeleteOtherItem(item: OtherItem) {
  if (item.serviceEvent) orderPendingDeletion.value = item.serviceEvent;
  else miscPendingDeletion.value = item;
}

async function confirmDeleteMisc() {
  if (!miscPendingDeletion.value?.miscExpense) return;
  await deleteMiscExpense(miscPendingDeletion.value.miscExpense.id);
  miscPendingDeletion.value = null;
}
</script>

<template>
  <div class="space-y-4">
    <!-- Top 3-Way Segmented Tabs (ТО, Ремонт, Прочее) -->
    <div class="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-xs font-bold transition">
      <button
        @click="activeMaintenanceSubTab = 'rules'"
        type="button"
        class="py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
        :class="activeMaintenanceSubTab === 'rules'
          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <ClipboardList class="w-4 h-4" />
        <span>ТО (Регламент)</span>
      </button>

      <button
        @click="activeMaintenanceSubTab = 'repairs'"
        type="button"
        class="py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
        :class="activeMaintenanceSubTab === 'repairs'
          ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <Wrench class="w-4 h-4" />
        <span>Ремонт</span>
      </button>

      <button
        @click="activeMaintenanceSubTab = 'other'"
        type="button"
        class="py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
        :class="activeMaintenanceSubTab === 'other'
          ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <Disc class="w-4 h-4" />
        <span>Прочее</span>
      </button>
    </div>

    <!-- ================= SUBTAB 1: ТО (РЕГЛАМЕНТ) ================= -->
    <div v-if="activeMaintenanceSubTab === 'rules'" class="space-y-4">
      <!-- Status chips and Add rule button -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            @click="ruleFilterStatus = 'all'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition"
            :class="ruleFilterStatus === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            Все ({{ rulesCounts.all }})
          </button>
          <button
            @click="ruleFilterStatus = 'overdue'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition flex items-center gap-1"
            :class="ruleFilterStatus === 'overdue' ? 'bg-red-600 text-white shadow-sm' : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400'"
          >
            <span>Просрочено</span>
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span>({{ rulesCounts.overdue }})</span>
          </button>
          <button
            @click="ruleFilterStatus = 'urgent'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition flex items-center gap-1"
            :class="ruleFilterStatus === 'urgent' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400'"
          >
            <span>Скоро</span>
            <span class="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>({{ rulesCounts.urgent }})</span>
          </button>
          <button
            @click="ruleFilterStatus = 'ok'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition flex items-center gap-1"
            :class="ruleFilterStatus === 'ok' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400'"
          >
            <span>В норме</span>
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>({{ rulesCounts.ok }})</span>
          </button>
        </div>

        <button
          @click="openAddRule"
          type="button"
          class="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Узел ТО</span>
        </button>
      </div>

      <!-- Rules Cards List -->
      <div class="space-y-3.5">
        <div
          v-for="rule in filteredRules"
          :key="rule.id"
          :id="`rule-card-${rule.id}`"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border transition-all"
          :class="[
            highlightedRuleId === rule.id ? 'border-blue-500 ring-4 ring-blue-500/30 animate-pulse-highlight' : 'border-slate-200 dark:border-slate-800'
          ]"
        >
          <!-- Card Header: Title, Status Dot & Action Icons -->
          <div class="flex items-start justify-between gap-3 mb-3">
            <div class="flex items-center gap-2 flex-1">
              <span
                class="w-2.5 h-2.5 rounded-full shrink-0"
                :class="{
                  'bg-red-500 animate-pulse': ruleStatusMap[rule.id]?.overallStatus === 'overdue',
                  'bg-amber-500': ruleStatusMap[rule.id]?.overallStatus === 'urgent',
                  'bg-emerald-500': ruleStatusMap[rule.id]?.overallStatus === 'ok'
                }"
              ></span>
              <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                {{ rule.name }}
              </h3>
            </div>

            <div class="flex items-center gap-1 shrink-0">
              <button
                @click="toggleNotify(rule)"
                type="button"
                class="w-7 h-7 rounded-lg flex items-center justify-center transition"
                :class="rule.notifyEnabled ? 'text-blue-600 hover:bg-blue-50' : 'text-slate-300 hover:bg-slate-100'"
                :title="rule.notifyEnabled ? 'Уведомления включены' : 'Уведомления отключены'"
              >
                <Bell v-if="rule.notifyEnabled" class="w-4 h-4" />
                <BellOff v-else class="w-4 h-4" />
              </button>
              <button
                @click="openEditRule(rule)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deleteRule(rule.id)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Dual Progress Scales (Mileage and Time) -->
          <div class="space-y-3 mb-4">
            <!-- 1. By Mileage -->
            <div v-if="rule.intervalKm && rule.lastReplacedKm" class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div class="flex items-center justify-between text-xs mb-1.5">
                <span class="text-slate-500 dark:text-slate-400 font-semibold">
                  Заменено на {{ formatKm(rule.lastReplacedKm) }} → Следующая: {{ formatKm(rule.lastReplacedKm + rule.intervalKm) }}
                </span>
                <span
                  class="font-black font-mono text-xs"
                  :class="ruleStatusMap[rule.id]?.isOverdueKm ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'"
                >
                  {{ ruleStatusMap[rule.id]?.isOverdueKm ? `Просрочено на ${formatKm(Math.abs(ruleStatusMap[rule.id]?.remainingKm || 0))}` : `Осталось ${formatKm(ruleStatusMap[rule.id]?.remainingKm || 0)}` }}
                </span>
              </div>
              <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-300"
                  :class="ruleStatusMap[rule.id]?.isOverdueKm ? 'bg-red-500' : 'bg-blue-600'"
                  :style="{ width: `${Math.min(100, Math.max(5, ((currentMileage - rule.lastReplacedKm) / rule.intervalKm) * 100))}%` }"
                ></div>
              </div>
            </div>

            <!-- 2. By Time -->
            <div v-if="rule.intervalDays && rule.lastReplacedDate" class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-slate-500 dark:text-slate-400 font-semibold">
                  Дата прошлой замены: {{ formatDateRu(rule.lastReplacedDate) }}
                </span>
                <span
                  class="font-black text-xs"
                  :class="ruleStatusMap[rule.id]?.isOverdueDays ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'"
                >
                  {{ formatDurationRu(ruleStatusMap[rule.id]?.remainingDays || 0) }}
                </span>
              </div>
              <div v-if="ruleStatusMap[rule.id]?.predictedDate && !ruleStatusMap[rule.id]?.isOverdueDays" class="text-[11px] text-slate-500 dark:text-slate-400">
                Срок замены: ~{{ ruleStatusMap[rule.id]?.predictedDate }}
              </div>
            </div>
          </div>

          <!-- Bottom Action: Confirm Service & Past History -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2">
            <button
              :id="`confirm-rule-${rule.id}`"
              @click="openConfirmService(rule)"
              type="button"
              class="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition"
            >
              <CheckCircle2 class="w-4 h-4" />
              <span>✅ Подтвердить ТО (Записать замену)</span>
            </button>

            <!-- Past History Toggle -->
            <button
              @click="expandedHistoryRuleId = expandedHistoryRuleId === rule.id ? null : rule.id"
              type="button"
              class="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
            >
              <span>История замен ({{ getPastEventsForRule(rule.id).length }})</span>
              <ChevronDown v-if="expandedHistoryRuleId !== rule.id" class="w-3.5 h-3.5" />
              <ChevronUp v-else class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Expanded Past History -->
          <div v-if="expandedHistoryRuleId === rule.id" class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <button
              v-for="ev in getPastEventsForRule(rule.id)"
              :key="ev.id"
              type="button"
              @click="navigateToOrder(ev.id)"
              class="w-full text-left text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50 dark:hover:bg-blue-950/30 flex items-center justify-between transition"
            >
              <div>
                <span class="font-bold text-slate-800 dark:text-slate-200">{{ formatDateRu(ev.date) }}</span>
                <span v-if="ev.mileage" class="text-slate-500"> • {{ formatKm(ev.mileage) }}</span>
                <span class="text-slate-500"> • {{ ev.organization }}</span>
              </div>
              <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                {{ formatCurrency(ev.totalLaborCost) }}
              </span>
            </button>
            <div v-if="getPastEventsForRule(rule.id).length === 0" class="text-xs text-slate-400 italic">
              Нет прошлых привязанных записей
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= SUBTAB 2: РЕМОНТ (ЗАКАЗ-НАРЯДЫ) ================= -->
    <div v-else-if="activeMaintenanceSubTab === 'repairs'" class="space-y-4">
      <!-- Top Action & Search -->
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">
          Заказ-наряды
        </h3>
        <button
          @click="openNewRepair"
          type="button"
          class="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition"
        >
          <Plus class="w-4 h-4 stroke-[3]" />
          <span>Заказ-наряд</span>
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="relative">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="repairSearchQuery"
            type="text"
            placeholder="Поиск по работе, СТО или артикулу детали..."
            class="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div class="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-semibold scrollbar-none">
          <select
            v-model="repairFilterYear"
            class="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
          >
            <option value="all">Все годы</option>
            <option v-for="y in repairYears" :key="y" :value="y">{{ y }}</option>
          </select>

          <select
            v-model="repairFilterOrg"
            class="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs"
          >
            <option value="all">Все СТО</option>
            <option v-for="org in repairOrgs" :key="org" :value="org">{{ org }}</option>
          </select>
        </div>

        <!-- Summary Strip -->
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <span class="text-slate-400 block text-[10px]">Работы</span>
            <span class="font-bold font-mono">{{ formatCurrency(repairTotals.labor) }}</span>
          </div>
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <span class="text-slate-400 block text-[10px]">Запчасти</span>
            <span class="font-bold font-mono">{{ formatCurrency(repairTotals.parts) }}</span>
          </div>
          <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
            <span class="text-emerald-600 block text-[10px] font-bold">Итого визиты</span>
            <span class="font-black font-mono">{{ formatCurrency(repairTotals.total) }}</span>
          </div>
        </div>
      </div>

      <!-- Repairs List -->
      <div class="space-y-3">
        <div
          v-for="order in filteredServiceEvents"
          :key="order.id"
          :id="`order-card-${order.id}`"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border transition-all"
          :class="highlightedOrderId === order.id ? 'border-blue-500 ring-4 ring-blue-500/30' : 'border-slate-200 dark:border-slate-800'"
        >
          <!-- Top Row: Date, Mileage, Actions -->
          <div class="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 mb-2.5">
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {{ formatDateRu(order.date) }}
              </span>
              <span v-if="order.mileage" class="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                {{ formatKm(order.mileage) }}
              </span>
              <span v-if="order.orderNumber" class="text-xs text-slate-400">
                #{{ order.orderNumber }}
              </span>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="openEditRepair(order)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="orderPendingDeletion = order"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Organization & Address -->
          <div class="mb-3">
            <div class="flex items-center gap-1.5 font-bold text-slate-900 dark:text-slate-100 text-sm">
              <Building2 class="w-4 h-4 text-emerald-600" />
              <span>{{ order.organization }}</span>
            </div>
            <div v-if="order.address" class="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 pl-5">
              <MapPin class="w-3 h-3" />
              <span>{{ order.address }}</span>
            </div>
          </div>

          <div v-if="order.items.some(item => item.maintenanceRuleId)" class="flex flex-wrap gap-1.5 mb-3">
            <template v-for="item in order.items" :key="`badge-${item.id}`">
              <span v-if="item.maintenanceRuleId" class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold">
                🔄 ТО: {{ activeMaintenanceRules.find(rule => rule.id === item.maintenanceRuleId)?.name || 'Узел обслуживания' }}
              </span>
            </template>
          </div>

          <!-- Works list -->
          <div class="space-y-1.5 mb-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-2xl">
            <div
              v-for="work in visibleWorks(order)"
              :key="work.id"
              class="flex items-center justify-between text-xs gap-2"
            >
              <span class="font-medium text-slate-800 dark:text-slate-200">• {{ work.name }}</span>
              <span class="font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">{{ formatCurrency(work.cost) }}</span>
            </div>
            <button
              v-if="order.items.length > 3"
              @click="toggleWorks(order.id)"
              type="button"
              class="w-full pt-1 text-left text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
            >
              <ChevronUp v-if="expandedWorkOrderIds.includes(order.id)" class="w-3.5 h-3.5" />
              <ChevronDown v-else class="w-3.5 h-3.5" />
              {{ expandedWorkOrderIds.includes(order.id) ? 'Свернуть' : `Ещё ${order.items.length - 3} работы` }}
            </button>
          </div>

          <!-- Attached Parts if present -->
          <div v-if="order.attachedPartIds && order.attachedPartIds.length > 0" class="mb-3 p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-300 mb-1">
              <Package class="w-3.5 h-3.5 text-amber-500" />
              <span>Установленные запчасти ({{ order.attachedPartIds.length }}):</span>
            </div>
            <div class="space-y-1">
              <div
                v-for="pid in order.attachedPartIds"
                :key="pid"
                class="flex items-center justify-between text-xs text-amber-800 dark:text-amber-200"
              >
                <span class="truncate">
                  {{ activeParts.find(p => p.id === pid)?.name || 'Деталь' }}
                  <span v-if="activeParts.find(p => p.id === pid)?.partNumber" class="text-[10px] text-slate-400 font-mono">
                    ({{ activeParts.find(p => p.id === pid)?.partNumber }})
                  </span>
                </span>
                <span class="font-mono font-bold shrink-0">
                  {{ formatCurrency(activeParts.find(p => p.id === pid)?.totalPrice) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="order.photoIds?.length" class="flex gap-2 overflow-x-auto pb-2 mb-3">
            <button
              v-for="photoId in order.photoIds"
              :key="photoId"
              type="button"
              @click="servicePhotos[photoId] && openLightbox(servicePhotos[photoId])"
              class="shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800"
              title="Открыть фото"
            >
              <img v-if="servicePhotos[photoId]" :src="servicePhotos[photoId]" alt="Фото заказ-наряда" class="w-24 h-24 object-cover" />
            </button>
          </div>

          <!-- Financial Total for this visit -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs font-bold">
            <div class="text-slate-500 space-y-0.5">
              <div>Работы: {{ formatCurrency(order.totalLaborCost) }} <span v-if="order.isCustomTotalLaborCost" class="text-[10px] text-amber-600">(изм. вручную)</span></div>
              <div>Запчасти: {{ formatCurrency(getOrderPartsCost(order)) }}</div>
            </div>
            <div class="text-sm font-black text-slate-900 dark:text-slate-100 font-mono text-right">
              Итого визит: {{ formatCurrency(order.totalLaborCost + getOrderPartsCost(order)) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= SUBTAB 3: ПРОЧЕЕ (УХОД, МОЙКА, ШИНОМОНТАЖ) ================= -->
    <div v-else-if="activeMaintenanceSubTab === 'other'" class="space-y-4">
      <!-- Header & Add Button -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
          <button
            @click="otherTagFilter = 'all'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition"
            :class="otherTagFilter === 'all' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            Все ({{ otherItems.length }})
          </button>
          <button
            @click="otherTagFilter = 'tire'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition"
            :class="otherTagFilter === 'tire' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            🛞 Шиномонтаж
          </button>
          <button
            @click="otherTagFilter = 'wash'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition"
            :class="otherTagFilter === 'wash' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            🚿 Мойка
          </button>
          <button
            @click="otherTagFilter = 'detailing'"
            type="button"
            class="px-2.5 py-1.5 rounded-xl transition"
            :class="otherTagFilter === 'detailing' ? 'bg-purple-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            ✨ Детейлинг
          </button>
        </div>

        <button
          @click="openNewOtherItem"
          type="button"
          class="h-9 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95 shrink-0"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Запись</span>
        </button>
      </div>

      <!-- Other Items List -->
      <div class="space-y-3">
        <div
          v-for="item in filteredOtherItems"
          :key="item.id"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors"
        >
          <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                :class="{
                  'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300': item.category === 'tire',
                  'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300': item.category === 'wash',
                  'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300': item.category === 'detailing'
                }"
              >
                {{ item.category === 'tire' ? 'Шиномонтаж' : (item.category === 'wash' ? 'Мойка' : 'Детейлинг') }}
              </span>
              <span class="text-xs text-slate-500">{{ formatDateRu(item.date) }}</span>
              <span v-if="item.mileage" class="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
                • {{ formatKm(item.mileage) }}
              </span>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="openEditOtherItem(item)"
                type="button"
                title="Редактировать"
                class="w-6 h-6 rounded text-slate-400 hover:text-purple-600 flex items-center justify-center transition"
              ><Edit2 class="w-3.5 h-3.5" /></button>
              <button
                @click="requestDeleteOtherItem(item)"
                type="button"
                title="Удалить"
                class="w-6 h-6 rounded text-slate-400 hover:text-red-600 flex items-center justify-center transition"
              ><Trash2 class="w-3.5 h-3.5" /></button>
            </div>
          </div>

          <div class="flex items-baseline justify-between">
            <div>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                {{ item.title }}
              </h4>
              <p v-if="item.organization" class="text-xs text-slate-500 mt-0.5">{{ item.organization }}</p>
              <p v-if="item.address" class="text-[11px] text-slate-400 mt-0.5">{{ item.address }}</p>
            </div>
            <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(item.cost) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <MaintenanceRuleModal
      :is-open="isRuleModalOpen"
      :rule-to-edit="editingRule"
      @close="isRuleModalOpen = false"
    />

    <LinkRuleToServiceModal
      :is-open="isLinkModalOpen"
      :rule="ruleForLinkModal"
      @close="isLinkModalOpen = false"
    />

    <MiscServiceModal
      :is-open="isMiscServiceModalOpen"
      :service-event-to-edit="editingOtherService"
      :misc-to-edit="editingOtherMisc"
      @close="isMiscServiceModalOpen = false"
    />

    <Teleport to="body">
      <div v-if="orderPendingDeletion" class="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" @click.self="orderPendingDeletion = null">
        <div class="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <h3 class="text-lg font-black text-slate-900 dark:text-slate-100">Удалить заказ-наряд?</h3>
          <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {{ formatDateRu(orderPendingDeletion.date) }} • {{ orderPendingDeletion.organization }}. Связанные узлы ТО вернутся к предыдущей замене.
          </p>
          <p v-if="orderPendingDeletion.attachedPartIds.length" class="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
            Что сделать с привязанными запчастями ({{ orderPendingDeletion.attachedPartIds.length }})?
          </p>
          <div class="mt-4 space-y-2">
            <button v-if="orderPendingDeletion.attachedPartIds.length" @click="confirmDeleteOrder(true)" type="button" class="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold">
              Удалить запись и вернуть детали на полку
            </button>
            <button @click="confirmDeleteOrder(false)" type="button" class="w-full h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold">
              {{ orderPendingDeletion.attachedPartIds.length ? 'Удалить запись вместе с деталями' : 'Удалить заказ-наряд' }}
            </button>
            <button @click="orderPendingDeletion = null" type="button" class="w-full h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold">Отмена</button>
          </div>
        </div>
      </div>

      <div v-if="miscPendingDeletion" class="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" @click.self="miscPendingDeletion = null">
        <div class="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-5 border border-slate-200 dark:border-slate-800">
          <h3 class="font-black text-slate-900 dark:text-slate-100">Удалить запись о мойке?</h3>
          <p class="mt-2 text-xs text-slate-500">{{ miscPendingDeletion.title }}</p>
          <div class="flex gap-2 mt-4">
            <button @click="miscPendingDeletion = null" type="button" class="flex-1 h-10 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold">Отмена</button>
            <button @click="confirmDeleteMisc" type="button" class="flex-1 h-10 rounded-xl bg-red-600 text-white text-xs font-bold">Удалить</button>
          </div>
        </div>
      </div>

      <div v-if="lightboxPhoto" class="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center p-4" @click.self="lightboxPhoto = null">
        <img
          :src="lightboxPhoto"
          alt="Фото заказ-наряда"
          class="max-w-full max-h-full object-contain transition-transform select-none"
          :style="{ transform: `scale(${lightboxZoom})` }"
          @wheel.prevent="lightboxZoom = Math.min(3, Math.max(0.5, lightboxZoom + ($event.deltaY < 0 ? 0.2 : -0.2)))"
        />
        <div class="absolute top-4 right-4 flex gap-2">
          <button @click="lightboxZoom = Math.max(0.5, lightboxZoom - 0.25)" type="button" class="w-10 h-10 rounded-xl bg-white/15 text-white text-xl">−</button>
          <button @click="lightboxZoom = Math.min(3, lightboxZoom + 0.25)" type="button" class="w-10 h-10 rounded-xl bg-white/15 text-white text-xl">+</button>
          <button @click="lightboxPhoto = null" type="button" class="w-10 h-10 rounded-xl bg-white/15 text-white text-xl" title="Закрыть">×</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

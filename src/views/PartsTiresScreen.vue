<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  currentMileage,
  activeParts,
  activeTireSets,
  activeInsurances,
  activeServiceEvents,
  activePartsSubTab,
  activeMaintenanceSubTab,
  currentTab,
  highlightedTireSetId,
  highlightedInsuranceId,
  isServiceModalOpen,
  editingServiceEvent,
  preselectedPartForService,
  saveServiceEvent,
  savePart,
  deletePart,
  deleteTireSet,
  archiveTireSet,
  mountTireSet,
  deleteInsurance,
  showToast
} from '../services/store';
import {
  formatKm,
  formatCurrency,
  formatDateRu,
  pluralize
} from '../services/calculations';
import type { Part, TireSet, InsuranceDocument } from '../types';
import PartModal from '../components/PartModal.vue';
import RebuyPartModal from '../components/RebuyPartModal.vue';
import TireSetModal from '../components/TireSetModal.vue';
import InsuranceModal from '../components/InsuranceModal.vue';
import MiscServiceModal from '../components/MiscServiceModal.vue';
import {
  Package,
  Wrench,
  Disc,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Search,
  RotateCw,
  Archive,
  AlertTriangle,
  RotateCcw
} from 'lucide-vue-next';

// Copied clipboard feedback state
const copiedPartNumber = ref<string | null>(null);

function copyToClipboard(text: string | null | undefined, label = 'Артикул') {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copiedPartNumber.value = text;
  showToast(`${label} ${text} скопирован в буфер!`);
  setTimeout(() => {
    if (copiedPartNumber.value === text) {
      copiedPartNumber.value = null;
    }
  }, 2000);
}

// Modals State
const isPartModalOpen = ref(false);
const editingPart = ref<Part | null>(null);
const defaultPartStatus = ref<'in_stock' | 'installed' | 'wishlist'>('in_stock');

const isRebuyModalOpen = ref(false);
const rebuySourcePart = ref<Part | null>(null);

const isTireModalOpen = ref(false);
const editingTire = ref<TireSet | null>(null);

const isInsuranceModalOpen = ref(false);
const editingInsurance = ref<InsuranceDocument | null>(null);

// Install Part Dialog
const partToInstall = ref<Part | null>(null);
const isInstallPartDialogOpen = ref(false);

// --- TAB 1: SHELF ---
const shelfFilter = ref<'all' | 'in_stock' | 'wishlist'>('all');
const shelfSearch = ref('');

const shelfParts = computed(() => {
  return activeParts.value.filter(p => p.status === 'in_stock' || p.status === 'wishlist');
});

const filteredShelfParts = computed(() => {
  let list = shelfParts.value;
  if (shelfFilter.value !== 'all') {
    list = list.filter(p => p.status === shelfFilter.value);
  }
  if (shelfSearch.value.trim()) {
    const q = shelfSearch.value.toLowerCase().trim();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q))
    );
  }
  return list;
});

function openAddShelfPart() {
  editingPart.value = null;
  defaultPartStatus.value = 'in_stock';
  isPartModalOpen.value = true;
}

function openEditPart(part: Part) {
  editingPart.value = part;
  isPartModalOpen.value = true;
}

const selectedServiceId = ref('');
const availableServiceOrders = computed(() => [...activeServiceEvents.value]
  .sort((a, b) => b.date.localeCompare(a.date) || (b.mileage || 0) - (a.mileage || 0)));

function openInstallDialog(part: Part) {
  partToInstall.value = part;
  selectedServiceId.value = '';
  isInstallPartDialogOpen.value = true;
}

async function linkPartToExistingOrder() {
  const part = partToInstall.value;
  const order = availableServiceOrders.value.find(item => item.id === selectedServiceId.value);
  if (!part || !order) {
    showToast('Выберите заказ-наряд');
    return;
  }
  await saveServiceEvent({
    ...order,
    attachedPartIds: [...new Set([...order.attachedPartIds, part.id])]
  });
  isInstallPartDialogOpen.value = false;
  showToast(`Деталь «${part.name}» привязана к заказ-наряду`);
}

function createOrderWithPart() {
  if (!partToInstall.value) return;
  editingServiceEvent.value = null;
  preselectedPartForService.value = partToInstall.value.id;
  isInstallPartDialogOpen.value = false;
  isServiceModalOpen.value = true;
}

function openLinkedService(serviceEventId: string) {
  const order = activeServiceEvents.value.find(item => item.id === serviceEventId);
  if (!order) return;
  currentTab.value = 'maintenance';
  activeMaintenanceSubTab.value = 'repairs';
  editingServiceEvent.value = order;
  isServiceModalOpen.value = true;
}

function getServiceOrderLabel(serviceEventId: string): string {
  const order = activeServiceEvents.value.find(item => item.id === serviceEventId);
  return order ? `Заказ-наряд: ${order.organization} от ${formatDateRu(order.date)} →` : 'Связанный заказ-наряд →';
}

async function fastMarkInstalled(part: Part) {
  await savePart({
    ...part,
    status: 'installed',
    installedMileage: currentMileage.value,
    installedDate: new Date().toISOString().split('T')[0],
    serviceEventId: null
  });
  isInstallPartDialogOpen.value = false;
  showToast(`Деталь «${part.name}» переведена в установленные на ${formatKm(currentMileage.value)}`);
}

// --- TAB 2: INSTALLED ---
const installedSearch = ref('');
const installedCategoryFilter = ref('all');

const installedParts = computed(() => {
  return activeParts.value.filter(p => p.status === 'installed');
});

const installedCategories = computed(() => {
  const cats = new Set<string>();
  for (const p of installedParts.value) {
    if (p.category) cats.add(p.category);
  }
  return Array.from(cats);
});

const filteredInstalledParts = computed(() => {
  let list = installedParts.value;

  if (installedCategoryFilter.value !== 'all') {
    list = list.filter(p => p.category === installedCategoryFilter.value);
  }

  if (installedSearch.value.trim()) {
    const q = installedSearch.value.toLowerCase().trim();
    list = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.brand && p.brand.toLowerCase().includes(q)) ||
      (p.partNumber && p.partNumber.toLowerCase().includes(q)) ||
      (p.store && p.store.toLowerCase().includes(q))
    );
  }

  // Sort by installed mileage descending
  return list.sort((a, b) => (b.installedMileage || 0) - (a.installedMileage || 0));
});

const totalInstalledSum = computed(() => {
  return installedParts.value.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
});

function openRebuyModal(part: Part) {
  rebuySourcePart.value = part;
  isRebuyModalOpen.value = true;
}

// --- TAB 3: TIRES ---
const currentYear = new Date().getFullYear();

const activeTires = computed(() => {
  // 2 active sets: mounted first, then stored
  return activeTireSets.value
    .filter(t => !t.isArchived)
    .sort((a, b) => (b.isMounted ? 1 : 0) - (a.isMounted ? 1 : 0));
});

const archivedTires = computed(() => {
  return activeTireSets.value.filter(t => t.isArchived);
});

function calculateTireTotalMileage(tire: TireSet): number {
  let drivenThisSeason = 0;
  if (tire.isMounted) {
    drivenThisSeason = Math.max(0, currentMileage.value - (tire.mountedAtMileage || currentMileage.value));
  }
  return (tire.baseMileage || 0) + drivenThisSeason;
}

function calculateTireSeasonMileage(tire: TireSet): number {
  if (!tire.isMounted) return 0;
  return Math.max(0, currentMileage.value - (tire.mountedAtMileage || currentMileage.value));
}

function openAddTire() {
  editingTire.value = null;
  isTireModalOpen.value = true;
}

function openEditTire(tire: TireSet) {
  editingTire.value = tire;
  isTireModalOpen.value = true;
}

// Dialog for mounting tire
const tireToMount = ref<TireSet | null>(null);
const isMountTireDialogOpen = ref(false);
const isMiscServiceModalOpen = ref(false);

function openMountTireDialog(tire: TireSet) {
  tireToMount.value = tire;
  isMountTireDialogOpen.value = true;
}

async function confirmMountOnly() {
  if (!tireToMount.value) return;
  await mountTireSet(tireToMount.value.id, currentMileage.value, false);
  isMountTireDialogOpen.value = false;
}

function confirmMountWithService() {
  isMountTireDialogOpen.value = false;
  isMiscServiceModalOpen.value = true;
}

// --- TAB 4: OSAGO ---
const viewingInsurance = ref<InsuranceDocument | null>(null);
const activeInsurancesList = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  // Active (endDate >= today) first, sorted by endDate DESC
  return [...activeInsurances.value].sort((a, b) => {
    const aActive = a.endDate >= today;
    const bActive = b.endDate >= today;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return b.endDate.localeCompare(a.endDate);
  });
});

function openAddInsurance() {
  editingInsurance.value = null;
  isInsuranceModalOpen.value = true;
}

function openEditInsurance(ins: InsuranceDocument) {
  editingInsurance.value = ins;
  isInsuranceModalOpen.value = true;
}

function renewInsurance(ins: InsuranceDocument) {
  const start = new Date(ins.endDate);
  start.setDate(start.getDate() + 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);

  editingInsurance.value = {
    ...ins,
    id: `doc-${Date.now()}`,
    startDate: start.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0]
  };
  isInsuranceModalOpen.value = true;
}

function isInsuranceExpired(endDate: string) {
  const today = new Date().toISOString().split('T')[0];
  return endDate < today;
}

function getInsuranceDaysRemaining(endDate: string) {
  const today = new Date().toISOString().split('T')[0];
  const end = new Date(endDate).getTime();
  return Math.ceil((end - new Date(today).getTime()) / (24 * 3600 * 1000));
}
</script>

<template>
  <div class="space-y-4">
    <!-- Top 4-Way Tabs (Полка, Установлено, Шины, ОСАГО) -->
    <div class="grid grid-cols-4 gap-1 p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-xs font-bold transition">
      <button
        @click="activePartsSubTab = 'shelf'"
        type="button"
        class="py-2.5 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1"
        :class="activePartsSubTab === 'shelf'
          ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <Package class="w-4 h-4" />
        <span>Полка</span>
      </button>

      <button
        @click="activePartsSubTab = 'installed'"
        type="button"
        class="py-2.5 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1"
        :class="activePartsSubTab === 'installed'
          ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <Wrench class="w-4 h-4" />
        <span>Установлено</span>
      </button>

      <button
        @click="activePartsSubTab = 'tires'"
        type="button"
        class="py-2.5 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1"
        :class="activePartsSubTab === 'tires'
          ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <Disc class="w-4 h-4" />
        <span>Шины</span>
      </button>

      <button
        @click="activePartsSubTab = 'osago'"
        type="button"
        class="py-2.5 rounded-xl transition flex flex-col sm:flex-row items-center justify-center gap-1"
        :class="activePartsSubTab === 'osago'
          ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
      >
        <ShieldCheck class="w-4 h-4" />
        <span>ОСАГО</span>
      </button>
    </div>

    <!-- ================= SUBTAB 1: ПОЛКА ================= -->
    <div v-if="activePartsSubTab === 'shelf'" class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">
          Склад и Черновики
        </h3>
        <button
          @click="openAddShelfPart"
          type="button"
          class="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
        >
          <Plus class="w-4 h-4" />
          <span>На полку</span>
        </button>
      </div>

      <!-- Filters & Search -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="relative">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="shelfSearch"
            type="text"
            placeholder="Поиск по детали, бренду, артикулу..."
            class="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div class="flex items-center gap-1.5 text-xs font-bold">
          <button
            @click="shelfFilter = 'all'"
            type="button"
            class="px-3 py-1.5 rounded-xl transition"
            :class="shelfFilter === 'all' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            Все ({{ shelfParts.length }})
          </button>
          <button
            @click="shelfFilter = 'in_stock'"
            type="button"
            class="px-3 py-1.5 rounded-xl transition flex items-center gap-1"
            :class="shelfFilter === 'in_stock' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            <span>✅ Куплено (ждёт ТО)</span>
          </button>
          <button
            @click="shelfFilter = 'wishlist'"
            type="button"
            class="px-3 py-1.5 rounded-xl transition flex items-center gap-1"
            :class="shelfFilter === 'wishlist' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            <span>📝 К покупке</span>
          </button>
        </div>
      </div>

      <!-- Shelf Cards -->
      <div class="space-y-3">
        <div
          v-for="part in filteredShelfParts"
          :key="part.id"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors"
        >
          <!-- Top Row -->
          <div class="flex items-start justify-between gap-3 pb-2.5 border-b border-slate-100 dark:border-slate-800 mb-2.5">
            <div>
              <span class="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider block mb-0.5">
                {{ part.category }}
              </span>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                {{ part.name }}
                <span v-if="part.brand" class="text-slate-500 font-normal"> • {{ part.brand }}</span>
              </h4>
            </div>

            <div class="flex items-center gap-1">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="part.status === 'in_stock' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'"
              >
                {{ part.status === 'in_stock' ? 'На полке' : 'Черновик' }}
              </span>
              <button
                @click="openEditPart(part)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deletePart(part.id)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Middle: Part Number & Store -->
          <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
            <div class="flex items-center gap-2 flex-wrap">
              <!-- Clickable Part Number with instant copy feedback -->
              <button
                v-if="part.partNumber"
                @click="copyToClipboard(part.partNumber, 'Артикул')"
                type="button"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition"
                title="Скопировать артикул"
              >
                <Check v-if="copiedPartNumber === part.partNumber" class="w-3.5 h-3.5 text-emerald-500" />
                <Copy v-else class="w-3.5 h-3.5 text-slate-400" />
                <span>{{ part.partNumber }}</span>
              </button>

              <span v-if="part.store" class="text-xs text-slate-500">
                🛒 {{ part.store }}
              </span>
            </div>

            <!-- Product Link -->
            <a
              v-if="part.productUrl"
              :href="part.productUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <span>Открыть товар</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </a>
          </div>

          <!-- Price & Actions -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div v-if="part.totalPrice" class="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                {{ formatCurrency(part.totalPrice) }}
                <span v-if="part.quantity > 1" class="text-xs text-slate-400 font-normal">({{ part.quantity }} шт)</span>
              </div>
              <div v-else class="text-xs text-slate-400 italic">
                Цена не указана
              </div>
            </div>

            <!-- Install / Link button -->
            <button
              v-if="part.status === 'in_stock'"
              @click="openInstallDialog(part)"
              type="button"
              class="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
            >
              <Wrench class="w-3.5 h-3.5" />
              <span>Установить / ТО</span>
            </button>
            <button
              v-else
              @click="openEditPart(part)"
              type="button"
              class="h-8 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100"
            >
              Куплено (внести цену)
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= SUBTAB 2: УСТАНОВЛЕНО ================= -->
    <div v-else-if="activePartsSubTab === 'installed'" class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="text-base font-black text-slate-900 dark:text-slate-100">
            Установленные детали
          </h3>
          <span class="text-xs text-slate-500">
            Всего: {{ installedParts.length }} поз. на {{ formatCurrency(totalInstalledSum) }}
          </span>
        </div>
        <button
          @click="openAddShelfPart; defaultPartStatus = 'installed'; isPartModalOpen = true"
          type="button"
          class="h-9 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
        >
          <Plus class="w-4 h-4" />
          <span>Деталь</span>
        </button>
      </div>

      <!-- Search & Category Filters -->
      <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
        <div class="relative">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="installedSearch"
            type="text"
            placeholder="Поиск по названию, бренду, артикулу..."
            class="w-full h-10 pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-semibold scrollbar-none">
          <button
            @click="installedCategoryFilter = 'all'"
            type="button"
            class="px-2.5 py-1 rounded-lg shrink-0 transition"
            :class="installedCategoryFilter === 'all' ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            Все ({{ installedParts.length }})
          </button>
          <button
            v-for="cat in installedCategories"
            :key="cat"
            @click="installedCategoryFilter = cat"
            type="button"
            class="px-2.5 py-1 rounded-lg shrink-0 transition"
            :class="installedCategoryFilter === cat ? 'bg-blue-600 text-white font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- Installed Cards List -->
      <div class="space-y-3">
        <div
          v-for="part in filteredInstalledParts"
          :key="part.id"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors"
        >
          <!-- Top Row -->
          <div class="flex items-start justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
            <div>
              <span class="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider block mb-0.5">
                {{ part.category }}
              </span>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                {{ part.name }}
                <span v-if="part.brand" class="text-slate-500 font-normal"> • {{ part.brand }}</span>
              </h4>
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="openEditPart(part)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deletePart(part.id)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Middle: Part Number with copy & Install stats -->
          <div class="space-y-1.5 mb-3">
            <div class="flex items-center gap-2 flex-wrap">
              <button
                v-if="part.partNumber"
                @click="copyToClipboard(part.partNumber, 'Артикул')"
                type="button"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-200 active:scale-95 transition"
                title="Скопировать артикул"
              >
                <Check v-if="copiedPartNumber === part.partNumber" class="w-3.5 h-3.5 text-emerald-500" />
                <Copy v-else class="w-3.5 h-3.5 text-slate-400" />
                <span>{{ part.partNumber }}</span>
              </button>

              <span v-if="part.store" class="text-xs text-slate-500">
                🛒 {{ part.store }}
              </span>
              <a
                v-if="part.productUrl"
                :href="part.productUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>Открыть товар</span>
                <ExternalLink class="w-3.5 h-3.5" />
              </a>
            </div>

            <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 flex-wrap">
              <span v-if="part.installedMileage !== null && part.installedMileage !== undefined">
                Установлено на: <strong class="text-slate-900 dark:text-slate-100 font-mono">{{ formatKm(part.installedMileage) }}</strong>
                <span class="text-slate-400 font-mono"> (прошла {{ formatKm(Math.max(0, currentMileage - part.installedMileage)) }})</span>
              </span>
              <span v-if="part.purchaseDate" class="text-slate-400">
                • {{ formatDateRu(part.purchaseDate) }}
              </span>
            </div>
            <button
              v-if="part.serviceEventId"
              type="button"
              class="text-left text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              @click="openLinkedService(part.serviceEventId)"
            >
              🔧 {{ getServiceOrderLabel(part.serviceEventId) }}
            </button>
          </div>

          <!-- Bottom: Price & MANDATORY REBUY BUTTON -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(part.totalPrice) }}
            </div>

            <!-- MANDATORY FEATURE: Rebuy / Duplicate to Shelf -->
            <button
              @click="openRebuyModal(part)"
              type="button"
              class="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
            >
              <RotateCw class="w-3.5 h-3.5 text-amber-500" />
              <span>🔄 Вернуть на полку</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ================= SUBTAB 3: ШИНЫ ================= -->
    <div v-else-if="activePartsSubTab === 'tires'" class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">
          Комплекты шин
        </h3>
        <button
          @click="openAddTire"
          type="button"
          class="h-9 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
        >
          <Plus class="w-4 h-4" />
          <span>Комплект шин</span>
        </button>
      </div>

      <!-- Active Tires (Top 2 Sets) -->
      <div class="space-y-3.5">
        <div
          v-for="tire in activeTires"
          :key="tire.id"
          :id="`tire-card-${tire.id}`"
          class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border transition-all"
          :class="[
            highlightedTireSetId === tire.id ? 'border-purple-500 ring-4 ring-purple-500/30 animate-pulse-highlight' : 'border-slate-200 dark:border-slate-800',
            tire.isMounted ? 'ring-2 ring-emerald-500/30' : ''
          ]"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2.5">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold"
                  :class="tire.season === 'summer' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'"
                >
                  {{ tire.season === 'summer' ? '☀️ Лето' : '❄️ Зима' }}
                </span>
                <span
                  v-if="tire.isMounted"
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center gap-1"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Сейчас на авто</span>
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                >
                  На хранении
                </span>
              </div>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-base">
                {{ tire.name }}
              </h4>
              <span class="text-xs font-mono font-bold text-slate-500">
                {{ tire.dimension }}
              </span>
            </div>

            <!-- Card Actions -->
            <div class="flex items-center gap-1">
              <button
                @click="openEditTire(tire)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="archiveTireSet(tire.id, true)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="В архив"
              >
                <Archive class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deleteTireSet(tire.id)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Mileage & Aging Stats -->
          <div class="space-y-2 mb-3">
            <div class="flex items-baseline justify-between">
              <div>
                <span class="text-xs text-slate-500 block">Общий пробег шин:</span>
                <span class="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
                  {{ formatKm(calculateTireTotalMileage(tire)) }}
                </span>
              </div>
              <div v-if="tire.isMounted" class="text-right">
                <span class="text-xs text-slate-500 block">В этом сезоне:</span>
                <span class="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {{ formatKm(calculateTireSeasonMileage(tire)) }}
                </span>
              </div>
            </div>

            <div class="text-xs text-slate-500">
              Год выпуска: <strong>{{ tire.manufactureYear }} (возраст: {{ currentYear - tire.manufactureYear }} лет)</strong>
              <span v-if="tire.purchasePrice"> • Покупка: {{ formatCurrency(tire.purchasePrice) }}</span>
            </div>

            <!-- Age Alert >= 6 years -->
            <div
              v-if="currentYear - tire.manufactureYear >= (tire.recommendedMaxAgeYears || 6)"
              class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Шинам уже {{ currentYear - tire.manufactureYear }} лет!</strong> Рекомендуемый срок службы — до {{ tire.recommendedMaxAgeYears || 6 }} лет. Проверьте остаток протектора и микротрещины.
              </div>
            </div>
          </div>

          <!-- Mount on car button if on storage -->
          <div v-if="!tire.isMounted" class="pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              @click="openMountTireDialog(tire)"
              type="button"
              class="w-full h-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition"
            >
              <Disc class="w-4 h-4" />
              <span>🛞 Установить на автомобиль</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Archived Tires Section -->
      <div v-if="archivedTires.length > 0" class="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Архив (Отработавшие шины)
        </h4>

        <div
          v-for="tire in archivedTires"
          :key="tire.id"
          class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 opacity-60 grayscale-[30%]"
        >
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-slate-600 dark:text-slate-400">
              {{ tire.name }} ({{ tire.dimension }})
            </span>
            <div class="flex items-center gap-1">
              <button
                @click="openEditTire(tire)"
                type="button"
                class="w-6 h-6 text-slate-400 hover:text-purple-600 flex items-center justify-center"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="archiveTireSet(tire.id, false)"
                type="button"
                class="text-xs text-blue-600 hover:underline font-semibold"
              >
                Вернуть из архива
              </button>
              <button
                @click="deleteTireSet(tire.id)"
                type="button"
                class="w-6 h-6 text-slate-400 hover:text-red-600 flex items-center justify-center"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div class="text-xs text-slate-500 font-mono">
            Итоговый пробег: {{ formatKm(tire.baseMileage) }}
          </div>
        </div>
      </div>
    </div>

    <!-- ================= SUBTAB 4: ОСАГО ================= -->
    <div v-else-if="activePartsSubTab === 'osago'" class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-base font-black text-slate-900 dark:text-slate-100">
          Страховка и полисы ОСАГО
        </h3>
        <button
          @click="openAddInsurance"
          type="button"
          class="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm transition active:scale-95"
        >
          <Plus class="w-4 h-4" />
          <span>Полис ОСАГО</span>
        </button>
      </div>

      <!-- Insurance Policies List -->
      <div class="space-y-3.5">
        <div
          v-for="ins in activeInsurancesList"
          :key="ins.id"
          :id="`doc-card-${ins.id}`"
          class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border transition-all"
          :class="[
            highlightedInsuranceId === ins.id ? 'border-emerald-500 ring-4 ring-emerald-500/30 animate-pulse-highlight' : 'border-slate-200 dark:border-slate-800',
            isInsuranceExpired(ins.endDate) ? 'opacity-60 grayscale-[20%]' : ''
          ]"
        >
          <!-- Top Row -->
          <div class="flex items-start justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800 mb-2.5">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold"
                  :class="!isInsuranceExpired(ins.endDate)
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500'"
                >
                  {{ !isInsuranceExpired(ins.endDate) ? 'Действует' : 'Истёк' }}
                </span>
                <span class="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {{ ins.company }}
                </span>
              </div>

              <!-- Clickable Policy Number -->
              <button
                @click="copyToClipboard(ins.policyNumber, 'Полис')"
                type="button"
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-mono font-bold flex items-center gap-1.5 hover:bg-slate-200 transition active:scale-95"
                title="Скопировать номер полиса"
              >
                <Check v-if="copiedPartNumber === ins.policyNumber" class="w-3.5 h-3.5 text-emerald-500" />
                <Copy v-else class="w-3.5 h-3.5 text-slate-400" />
                <span>{{ ins.policyNumber }}</span>
              </button>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1">
              <button
                @click="openEditInsurance(ins)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Редактировать"
              >
                <Edit2 class="w-3.5 h-3.5" />
              </button>
              <button
                @click="deleteInsurance(ins.id)"
                type="button"
                class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-100 flex items-center justify-center transition"
                title="Удалить"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Dates & Countdown -->
          <div class="space-y-2 mb-3">
            <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <span>Срок: с {{ formatDateRu(ins.startDate) }} по {{ formatDateRu(ins.endDate) }}</span>
              <span class="font-bold font-mono text-slate-900 dark:text-slate-100">
                {{ formatCurrency(ins.cost) }}
              </span>
            </div>

            <!-- Expiring warning if <= 30 days -->
            <div
              v-if="!isInsuranceExpired(ins.endDate) && getInsuranceDaysRemaining(ins.endDate) <= 30"
              class="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2"
            >
              <AlertTriangle class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Полис заканчивается через {{ pluralize(getInsuranceDaysRemaining(ins.endDate), 'день', 'дня', 'дней') }}!</strong>
                Не забудьте продлить страховку вовремя.
              </div>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap justify-end gap-2">
            <button
              v-if="ins.fileUrl"
              type="button"
              class="h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs"
              @click="viewingInsurance = ins"
            >
              📄 Открыть фото / PDF полиса
            </button>
            <button
              @click="renewInsurance(ins)"
              type="button"
              class="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition"
            >
              <RotateCcw class="w-3.5 h-3.5" />
              <span>🔄 Продлить на новый год</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <PartModal
      :is-open="isPartModalOpen"
      :part-to-edit="editingPart"
      :default-status="defaultPartStatus"
      @close="isPartModalOpen = false"
    />

    <RebuyPartModal
      :is-open="isRebuyModalOpen"
      :source-part="rebuySourcePart"
      @close="isRebuyModalOpen = false"
    />

    <TireSetModal
      :is-open="isTireModalOpen"
      :tire-to-edit="editingTire"
      @close="isTireModalOpen = false"
    />

    <InsuranceModal
      :is-open="isInsuranceModalOpen"
      :insurance-to-edit="editingInsurance"
      @close="isInsuranceModalOpen = false"
    />

    <MiscServiceModal
      :is-open="isMiscServiceModalOpen"
      :initial-tire-set-id="tireToMount?.id"
      @close="isMiscServiceModalOpen = false"
    />

    <div
      v-if="viewingInsurance?.fileUrl"
      class="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      @click.self="viewingInsurance = null"
    >
      <div class="bg-white dark:bg-slate-900 w-full max-w-3xl h-[90vh] rounded-3xl overflow-hidden flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
            Полис {{ viewingInsurance.policyNumber }}
          </h3>
          <button
            type="button"
            class="h-8 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold"
            @click="viewingInsurance = null"
          >
            Закрыть
          </button>
        </div>
        <img
          v-if="viewingInsurance.fileUrl.startsWith('data:image/')"
          :src="viewingInsurance.fileUrl"
          alt="Фото полиса ОСАГО"
          class="flex-1 min-h-0 object-contain bg-slate-100 dark:bg-slate-950"
        />
        <iframe
          v-else
          :src="viewingInsurance.fileUrl"
          title="PDF полиса ОСАГО"
          class="flex-1 w-full bg-white"
        />
      </div>
    </div>

    <!-- Install Part Dialog -->
    <div
      v-if="isInstallPartDialogOpen && partToInstall"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isInstallPartDialogOpen = false"
    >
      <div class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
          Установить «{{ partToInstall.name }}»
        </h3>
        <p class="text-xs text-slate-500">
          Выберите способ фиксации установки:
        </p>

        <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
          <label for="existing-service-order" class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Связать с существующим заказ-нарядом (ТО)
          </label>
          <select
            id="existing-service-order"
            v-model="selectedServiceId"
            class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
          >
            <option value="" disabled>Выберите заказ-наряд</option>
            <option v-for="order in availableServiceOrders" :key="order.id" :value="order.id">
              {{ formatDateRu(order.date) }} — {{ order.organization }} — {{ order.items.map(item => item.name).join(', ') }}
            </option>
          </select>
          <button
            @click="linkPartToExistingOrder"
            type="button"
            class="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
          >
            Привязать деталь к выбранному ТО
          </button>
        </div>

        <button
          @click="createOrderWithPart"
          type="button"
          class="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition font-semibold text-xs flex items-center gap-2"
        >
          <Plus class="w-4 h-4 text-blue-500" />
          <span>Создать новый заказ-наряд с этой деталью</span>
        </button>

        <button
          @click="fastMarkInstalled(partToInstall)"
          type="button"
          class="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition font-semibold text-xs flex items-center gap-2"
        >
          <Check class="w-4 h-4 text-emerald-500" />
          <span>Быстро отметить установленной (на пробеге {{ formatKm(currentMileage) }})</span>
        </button>

        <button
          @click="isInstallPartDialogOpen = false"
          type="button"
          class="w-full h-10 text-xs text-slate-400"
        >
          Отмена
        </button>
      </div>
    </div>

    <!-- Mount Tire Dialog -->
    <div
      v-if="isMountTireDialogOpen && tireToMount"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isMountTireDialogOpen = false"
    >
      <div class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
          Установить комплект «{{ tireToMount.name }}»?
        </h3>
        <p class="text-xs text-slate-500">
          Пробег установки: {{ formatKm(currentMileage) }}.
        </p>

        <button
          @click="confirmMountWithService"
          type="button"
          class="w-full p-3.5 rounded-2xl bg-purple-600 text-white hover:bg-purple-700 text-left transition font-bold text-xs flex items-center gap-2 shadow-md"
        >
          <Wrench class="w-4 h-4" />
          <span>🛠️ Да, и добавить запись о Шиномонтаже</span>
        </button>

        <button
          @click="confirmMountOnly"
          type="button"
          class="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition font-semibold text-xs"
        >
          Просто переключить резину (без записи расходов)
        </button>

        <button
          @click="isMountTireDialogOpen = false"
          type="button"
          class="w-full h-10 text-xs text-slate-400"
        >
          Отмена
        </button>
      </div>
    </div>
  </div>
</template>

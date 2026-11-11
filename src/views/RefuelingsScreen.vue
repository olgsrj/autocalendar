<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  activeCar,
  activeRefuelings,
  deleteRefueling,
  isRefuelModalOpen,
  editingRefueling
} from '../services/store';
import { db } from '../db';
import {
  formatKm,
  formatCurrency,
  formatLiters,
  formatDateRu
} from '../services/calculations';
import type { Refueling, PhotoAttachment } from '../types';
import {
  Plus,
  Edit2,
  Trash2,
  Droplet,
  Tag,
  AlertCircle,
  Image as ImageIcon,
  X
} from 'lucide-vue-next';

const photos = ref<PhotoAttachment[]>([]);
const lightboxPhoto = ref<PhotoAttachment | null>(null);
const photoMap = computed(() => new Map(photos.value.map(photo => [photo.id, photo])));

watch(
  () => activeRefuelings.value.map(item => item.photoId).join(','),
  async () => {
    const ids = activeRefuelings.value.map(item => item.photoId).filter((id): id is string => Boolean(id));
    photos.value = await db.photos.where('id').anyOf(ids).toArray();
  },
  { immediate: true }
);

// Filters
const selectedYear = ref<string>('all');
const onlyWithDiscount = ref<boolean>(false);
const deleteConfirmId = ref<string | null>(null);

// Extract available years from refuelings
const availableYears = computed(() => {
  const yearsSet = new Set<string>();
  for (const r of activeRefuelings.value) {
    if (r.date) {
      yearsSet.add(r.date.split('-')[0]);
    }
  }
  return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
});

// Filtered refuelings (sorted newest to oldest by mileage DESC)
const filteredRefuelings = computed(() => {
  let list = [...activeRefuelings.value];

  // Year filter
  if (selectedYear.value !== 'all') {
    list = list.filter(r => r.date.startsWith(selectedYear.value));
  }

  // Discount filter
  if (onlyWithDiscount.value) {
    list = list.filter(r => r.discountAmount && r.discountAmount > 0.5);
  }

  // Sort descending: highest mileage / latest date first
  return list.sort((a, b) => {
    if (b.mileage !== a.mileage) return b.mileage - a.mileage;
    return b.date.localeCompare(a.date);
  });
});

// Summary strip for filtered view
const summaryStats = computed(() => {
  const list = filteredRefuelings.value;
  const totalCost = list.reduce((sum, r) => sum + (r.actualCost || 0), 0);
  const totalLiters = list.reduce((sum, r) => sum + (r.liters || 0), 0);
  const totalDiscounts = list.reduce((sum, r) => sum + (r.discountAmount || 0), 0);

  // Station price average
  const stationItems = list.filter(r => r.stationPrice && r.stationPrice > 0);
  const avgStationPrice = stationItems.length > 0
    ? Math.round((stationItems.reduce((sum, r) => sum + (r.stationPrice || 0), 0) / stationItems.length) * 100) / 100
    : 0;

  // Effective price average
  const avgEffectivePrice = totalLiters > 0
    ? Math.round((totalCost / totalLiters) * 100) / 100
    : 0;

  // Average consumption
  const fullTanks = list.filter(r => r.isFullTank && r.consumption && r.consumption > 0);
  const avgConsumption = fullTanks.length > 0
    ? Math.round((fullTanks.reduce((sum, r) => sum + (r.consumption || 0), 0) / fullTanks.length) * 100) / 100
    : null;

  return {
    totalCost,
    totalLiters,
    totalDiscounts,
    avgStationPrice,
    avgEffectivePrice,
    avgConsumption,
    count: list.length
  };
});

function openNewRefuel() {
  editingRefueling.value = null;
  isRefuelModalOpen.value = true;
}

function openEditRefuel(refuel: Refueling) {
  editingRefueling.value = refuel;
  isRefuelModalOpen.value = true;
}

async function confirmDelete(id: string) {
  await deleteRefueling(id);
  deleteConfirmId.value = null;
}

// Consumption badge color helper
function getConsumptionColorClass(c: number) {
  if (c < 8.5) {
    return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
  }
  if (c <= 11.0) {
    return 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
  }
  return 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
}
</script>

<template>
  <div class="space-y-4">
    <!-- Block 1: Header Bar & Add Button -->
    <div class="flex items-center justify-between gap-3">
      <div>
        <h2 class="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <span>Заправки</span>
          <span class="text-sm font-semibold text-slate-500 dark:text-slate-400">
            ({{ activeRefuelings.length }})
          </span>
        </h2>
      </div>

      <button
        @click="openNewRefuel"
        type="button"
        class="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-1.5 shadow-md shadow-blue-500/20 active:scale-95 transition"
      >
        <Plus class="w-4 h-4 stroke-[3]" />
        <span>Заправка</span>
      </button>
    </div>

    <!-- Block 2: Filter Strip & Summary Strip -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors space-y-4">
      <!-- Horizontal Period Filter Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        <button
          @click="selectedYear = 'all'"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition"
          :class="selectedYear === 'all'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
        >
          Все годы
        </button>

        <button
          v-for="yr in availableYears"
          :key="yr"
          @click="selectedYear = yr"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition"
          :class="selectedYear === yr
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
        >
          {{ yr }}
        </button>

        <div class="h-4 w-px bg-slate-300 dark:bg-slate-700 shrink-0 mx-1"></div>

        <button
          @click="onlyWithDiscount = !onlyWithDiscount"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 flex items-center gap-1 transition"
          :class="onlyWithDiscount
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
        >
          <Tag class="w-3.5 h-3.5" />
          <span>Только со скидкой</span>
        </button>
      </div>

      <!-- Compact Summary Strip -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
        <!-- 1. Total Spent -->
        <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Потрачено
          </div>
          <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono truncate">
            {{ formatCurrency(summaryStats.totalCost) }}
          </div>
          <div class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate mt-0.5">
            Скидки: {{ formatCurrency(summaryStats.totalDiscounts) }}
          </div>
        </div>

        <!-- 2. Liters -->
        <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Залито литров
          </div>
          <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono truncate">
            {{ formatLiters(summaryStats.totalLiters) }}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {{ summaryStats.count }} заправок
          </div>
        </div>

        <!-- 3. Average Consumption -->
        <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Средний расход
          </div>
          <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono truncate">
            {{ summaryStats.avgConsumption ? `${summaryStats.avgConsumption} л` : '—' }}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            на 100 км
          </div>
        </div>

        <!-- 4. Average liter price -->
        <div class="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50">
          <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Средняя цена 1 л
          </div>
          <div class="text-base font-black text-slate-900 dark:text-slate-100 font-mono truncate">
            {{ summaryStats.avgEffectivePrice }} ₽/л
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            Стела: ~{{ summaryStats.avgStationPrice }} ₽/л
          </div>
        </div>
      </div>
    </div>

    <!-- Block 3: Refuelings List (Newest to Oldest) -->
    <div class="space-y-3">
      <div
        v-for="item in filteredRefuelings"
        :key="item.id"
        class="bg-white dark:bg-slate-900 rounded-3xl p-4 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors"
      >
        <!-- Top Row: Date, Mileage, Delta, Edit/Delete Buttons -->
        <div class="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80 mb-2.5">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {{ formatDateRu(item.date) }}
            </span>
            <span class="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatKm(item.mileage) }}
            </span>
            <span
              v-if="item.deltaKm > 0"
              class="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              +{{ item.deltaKm }} км
            </span>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1">
            <button
              v-if="item.photoId && photoMap.get(item.photoId)"
              @click="lightboxPhoto = photoMap.get(item.photoId) || null"
              type="button"
              title="Открыть фото чека"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
            >
              <ImageIcon class="w-3.5 h-3.5" />
            </button>
            <button
              @click="openEditRefuel(item)"
              type="button"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition active:scale-95"
              title="Редактировать"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </button>

            <!-- Delete with inline confirmation -->
            <button
              v-if="deleteConfirmId !== item.id"
              @click="deleteConfirmId = item.id"
              type="button"
              class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition active:scale-95"
              title="Удалить"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
            <div v-else class="flex items-center gap-1 bg-red-50 dark:bg-red-950/60 p-1 rounded-lg">
              <span class="text-[10px] text-red-700 dark:text-red-300 font-bold px-1">Удалить на {{ formatKm(item.mileage) }}?</span>
              <button
                @click="confirmDelete(item.id)"
                type="button"
                class="px-2 py-0.5 bg-red-600 text-white rounded text-[10px] font-bold"
              >
                Да
              </button>
              <button
                @click="deleteConfirmId = null"
                type="button"
                class="px-1 py-0.5 text-slate-500 text-[10px]"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- Middle Row: Liters, Price, Fuel Badge, Total Cost & Discount -->
        <div class="flex items-baseline justify-between mb-2">
          <div>
            <div class="flex items-center gap-2">
              <span
                v-if="item.fuelType"
                class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
              >
                АИ-{{ item.fuelType }}
              </span>

              <span v-if="item.liters" class="text-base font-black text-slate-900 dark:text-slate-100 font-mono">
                {{ item.liters }} л
              </span>
              <span v-else class="text-xs text-slate-400 italic">
                Литры не указаны
              </span>

              <span v-if="item.stationPrice" class="text-xs text-slate-500 dark:text-slate-400 font-mono">
                × {{ item.stationPrice }} ₽/л
              </span>
            </div>

            <!-- Discount Badge -->
            <div
              v-if="item.discountAmount && item.discountAmount > 0.5"
              class="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 text-[11px] font-semibold"
            >
              <span>По чеку: {{ item.effectiveLiterPrice }} ₽/л</span>
              <span>•</span>
              <span>Скидка {{ formatCurrency(item.discountAmount, true) }}</span>
            </div>
          </div>

          <!-- Total Cost -->
          <div class="text-right">
            <div class="text-lg font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(item.actualCost, true) }}
            </div>
            <div
              v-if="item.calculatedCost && item.discountAmount > 0.5"
              class="text-[11px] text-slate-400 line-through font-mono"
            >
              {{ formatCurrency(item.calculatedCost, true) }}
            </div>
          </div>
        </div>

        <!-- Bottom Row: Consumption Badge & Range or Partial Refuel -->
        <div class="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
          <div v-if="item.isFullTank && item.consumption" class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded-lg border font-bold flex items-center gap-1 text-xs"
              :class="getConsumptionColorClass(item.consumption)"
            >
              <Droplet class="w-3 h-3" />
              <span>{{ item.consumption }} л/100 км</span>
            </span>

            <span v-if="item.rangeRemaining" class="text-[11px] text-slate-500 dark:text-slate-400">
              Бака {{ activeCar?.tankVolume || 60 }} л хватит на ~{{ item.rangeRemaining }} км
            </span>
          </div>

          <div v-else-if="!item.isFullTank" class="flex items-center gap-1.5 text-slate-400 text-[11px] italic">
            <AlertCircle class="w-3.5 h-3.5" />
            <span>Частичная заправка (дозаправка)</span>
          </div>

          <div v-else class="text-[11px] text-slate-400">Первая отсечка полного бака</div>

          <span v-if="item.notes" class="text-[11px] text-slate-400 max-w-[140px] truncate" :title="item.notes">
            💬 {{ item.notes }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="lightboxPhoto" class="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center p-3" @click="lightboxPhoto = null">
      <button type="button" title="Закрыть фото" class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center" @click="lightboxPhoto = null">
        <X class="w-6 h-6" />
      </button>
      <img :src="lightboxPhoto.dataUrl" alt="Чек заправки" class="max-w-full max-h-full object-contain" @click.stop />
    </div>
  </div>
</template>

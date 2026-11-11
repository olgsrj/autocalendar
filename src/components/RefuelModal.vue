<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import {
  activeCar,
  activeRefuelings,
  currentMileage,
  isRefuelModalOpen,
  editingRefueling,
  saveRefueling,
  loadAllData,
  showToast
} from '../services/store';
import { db } from '../db';
import { parseInputNumber, formatCurrency, formatKm } from '../services/calculations';
import type { FuelType } from '../types';
import { Fuel, X, Check, RotateCcw, AlertTriangle, Sparkles, Camera, Trash2 } from 'lucide-vue-next';

const FUEL_TYPES: FuelType[] = ['ДТ', '92', '95', '95+', '100', '100+'];

const formDate = ref('');
const formMileage = ref('');
const formFuelType = ref<FuelType | string>('95');
const formLiters = ref('');
const formStationPrice = ref('');
const formActualCost = ref('');
const isCustomCost = ref(false);
const formIsFullTank = ref(true);
const formIsMissedPrevious = ref(false);
const formNotes = ref('');
const photoDataUrl = ref('');
const photoInput = ref<HTMLInputElement | null>(null);
const litersInput = ref<HTMLInputElement | null>(null);
const isSubmitting = ref(false);

// Previous refueling for hints and defaults
const lastRefuel = computed(() => {
  if (activeRefuelings.value.length === 0) return null;
  // If editing, find the one before it
  if (editingRefueling.value) {
    const sorted = [...activeRefuelings.value].sort((a, b) => b.mileage - a.mileage);
    const currIdx = sorted.findIndex(r => r.id === editingRefueling.value?.id);
    return sorted[currIdx + 1] || null;
  }
  const sorted = [...activeRefuelings.value].sort((a, b) => b.mileage - a.mileage);
  return sorted[0];
});

const prevMileage = computed(() => {
  if (lastRefuel.value) return lastRefuel.value.mileage;
  return activeCar.value?.purchaseMileage || 0;
});

// Delta calculation
const deltaKm = computed(() => {
  const current = parseInputNumber(formMileage.value);
  const prev = prevMileage.value;
  return current - prev;
});

// Calculated cost based on liters * stationPrice
const calculatedCost = computed(() => {
  const l = parseInputNumber(formLiters.value);
  const p = parseInputNumber(formStationPrice.value);
  if (l > 0 && p > 0) {
    return Math.round(l * p * 100) / 100;
  }
  return 0;
});

// Actual cost number
const currentActualCost = computed(() => {
  return parseInputNumber(formActualCost.value);
});

// Discount / Benefit calculation
const discountInfo = computed(() => {
  const calc = calculatedCost.value;
  const actual = currentActualCost.value;
  const l = parseInputNumber(formLiters.value);

  if (calc > 0 && actual > 0 && isCustomCost.value) {
    const diff = Math.round((calc - actual) * 100) / 100;
    const effectivePrice = l > 0 ? Math.round((actual / l) * 100) / 100 : 0;
    const percent = Math.round((diff / calc) * 1000) / 10;

    return {
      hasDiscount: diff > 0.5,
      hasSurcharge: diff < -0.5,
      diff: Math.abs(diff),
      effectivePrice,
      percent: Math.abs(percent)
    };
  }
  return null;
});

const pendingPartials = computed(() => {
  const previous = lastRefuel.value;
  if (!previous) return { liters: 0, km: 0 };
  const sorted = [...activeRefuelings.value]
    .filter(item => item.mileage <= previous.mileage)
    .sort((a, b) => a.mileage - b.mileage || a.date.localeCompare(b.date));
  let liters = 0;
  let km = 0;
  for (const item of sorted) {
    if (item.isMissedPrevious || item.liters === null || item.isFullTank) {
      liters = 0;
      km = 0;
    } else {
      liters += item.liters;
      km += item.deltaKm;
    }
  }
  return { liters, km };
});

const liveConsumption = computed(() => {
  if (!formIsFullTank.value || formIsMissedPrevious.value) return null;
  const liters = parseInputNumber(formLiters.value) + pendingPartials.value.liters;
  const distance = deltaKm.value + pendingPartials.value.km;
  if (liters > 0 && distance > 0) {
    return Math.round((liters / distance) * 10_000) / 100;
  }
  return null;
});

// Watch auto calculation of cost
watch([() => formLiters.value, () => formStationPrice.value], ([newL, newP]) => {
  if (!isCustomCost.value) {
    const l = parseInputNumber(newL);
    const p = parseInputNumber(newP);
    if (l > 0 && p > 0) {
      formActualCost.value = (Math.round(l * p * 100) / 100).toFixed(2);
    } else {
      formActualCost.value = '';
    }
  }
});

function onActualCostInput() {
  isCustomCost.value = true;
}

function resetToAutoCost() {
  isCustomCost.value = false;
  const l = parseInputNumber(formLiters.value);
  const p = parseInputNumber(formStationPrice.value);
  if (l > 0 && p > 0) {
    formActualCost.value = (Math.round(l * p * 100) / 100).toFixed(2);
  } else {
    formActualCost.value = '';
  }
}

watch(
  () => isRefuelModalOpen.value,
  async (open) => {
    if (!open) return;
    photoDataUrl.value = '';

    if (editingRefueling.value) {
      const refueling = editingRefueling.value;
      formDate.value = refueling.date;
      formMileage.value = String(refueling.mileage);
      formFuelType.value = refueling.fuelType;
      formLiters.value = refueling.liters !== null ? String(refueling.liters) : '';
      formStationPrice.value = refueling.stationPrice !== null ? String(refueling.stationPrice) : '';
      formActualCost.value = String(refueling.actualCost);
      isCustomCost.value = refueling.calculatedCost !== null
        && Math.abs(refueling.calculatedCost - refueling.actualCost) > 0.005;
      formIsFullTank.value = refueling.isFullTank;
      formIsMissedPrevious.value = refueling.isMissedPrevious;
      formNotes.value = refueling.notes || '';
      if (refueling.photoId) {
        photoDataUrl.value = (await db.photos.get(refueling.photoId))?.dataUrl || '';
      }
    } else {
      formDate.value = new Date().toISOString().split('T')[0];
      formMileage.value = String(currentMileage.value || prevMileage.value || '');
      const last = lastRefuel.value;
      formFuelType.value = last?.fuelType || activeCar.value?.defaultFuelType || '95';
      formStationPrice.value = last?.stationPrice !== null && last?.stationPrice !== undefined ? String(last.stationPrice) : '';
      formLiters.value = '';
      formActualCost.value = '';
      isCustomCost.value = false;
      formIsFullTank.value = true;
      formIsMissedPrevious.value = false;
      formNotes.value = '';
      await nextTick();
      litersInput.value?.focus();
    }
  }
);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function onPhotoSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const source = await readFileAsDataUrl(file);
    const image = new Image();
    image.src = source;
    await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    photoDataUrl.value = canvas.toDataURL('image/jpeg', 0.78);
  } catch {
    showToast('Не удалось обработать фотографию');
  } finally {
    input.value = '';
  }
}

async function onSave() {
  const km = parseInputNumber(formMileage.value);
  const actualCost = parseInputNumber(formActualCost.value);
  if (!formDate.value || !km || km <= 0 || actualCost <= 0) return;
  if (!editingRefueling.value && lastRefuel.value && formDate.value >= lastRefuel.value.date && deltaKm.value < 0) {
    showToast('Пробег меньше предыдущего. Проверьте одометр.');
    return;
  }

  isSubmitting.value = true;
  try {
    const id = editingRefueling.value?.id || `refuel-${Date.now()}`;
    const oldPhotoId = editingRefueling.value?.photoId;
    const photoId = photoDataUrl.value ? oldPhotoId || `photo-${id}` : null;
    await saveRefueling({
      id,
      date: formDate.value,
      mileage: km,
      fuelType: formFuelType.value,
      liters: formLiters.value ? parseInputNumber(formLiters.value) : null,
      stationPrice: formStationPrice.value ? parseInputNumber(formStationPrice.value) : null,
      actualCost,
      isFullTank: formIsFullTank.value,
      isMissedPrevious: formIsMissedPrevious.value,
      notes: formNotes.value || null,
      photoId
    });
    if (photoDataUrl.value && photoId && activeCar.value) {
      await db.photos.put({
        id: photoId,
        carId: activeCar.value.id,
        entityType: 'refueling',
        entityId: id,
        dataUrl: photoDataUrl.value,
        createdAt: new Date().toISOString()
      });
    } else if (oldPhotoId) {
      await db.photos.delete(oldPhotoId);
    }
    await loadAllData();
    isRefuelModalOpen.value = false;
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="isRefuelModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isRefuelModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Fuel class="w-4 h-4" />
            </div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
              {{ editingRefueling ? 'Редактировать заправку' : 'Новая заправка' }}
            </h3>
          </div>
          <button
            @click="isRefuelModalOpen = false"
            class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Form Body -->
        <div class="space-y-4 overflow-y-auto flex-1 pr-1 py-1">
          <!-- Fuel Type Chips -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Марка топлива
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="ft in FUEL_TYPES"
                :key="ft"
                @click="formFuelType = ft"
                type="button"
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95"
                :class="formFuelType === ft
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
              >
                {{ ft }}
              </button>
            </div>
          </div>

          <!-- Mileage & Date (2 columns) -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Пробег (км) *
              </label>
              <input
                v-model="formMileage"
                type="text"
                inputmode="numeric"
                placeholder="203408"
                class="w-full h-11 px-3.5 rounded-xl border bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                :class="deltaKm < 0 ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'"
              />
              <div class="text-[11px] mt-1">
                <span v-if="deltaKm > 0" class="text-emerald-600 dark:text-emerald-400 font-semibold">
                  Пробег с прошлой заправки (Δ): +{{ formatKm(deltaKm) }}
                </span>
                <span v-else-if="deltaKm === 0" class="text-slate-400">
                  Предыдущий пробег: {{ formatKm(prevMileage) }} (измените последние цифры)
                </span>
                <span v-else class="text-red-500 font-semibold flex items-center gap-1">
                  <AlertTriangle class="w-3 h-3" />
                  Пробег меньше предыдущего ({{ formatKm(prevMileage) }})
                </span>
                <div v-if="deltaKm > 1000" class="text-amber-600 dark:text-amber-400 mt-1">
                  Большой пробег (+{{ formatKm(deltaKm) }}). Проверьте одометр или пропущенную заправку.
                </div>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата *
              </label>
              <input
                v-model="formDate"
                type="date"
                class="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- Liters & Station Price (2 columns) -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Литры (л)
              </label>
              <input
                ref="litersInput"
                v-model="formLiters"
                type="text"
                inputmode="decimal"
                placeholder="40.0"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Цена стелы (₽/л)
              </label>
              <input
                v-model="formStationPrice"
                type="text"
                inputmode="decimal"
                placeholder="70.82"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- Total Cost Field with Auto / Manual Switch -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Итого по чеку (₽) *
              </label>
              <button
                v-if="isCustomCost"
                @click="resetToAutoCost"
                type="button"
                class="text-[11px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
              >
                <RotateCcw class="w-3 h-3" />
                <span>↺ Рассчитать автоматически</span>
              </button>
              <span v-else class="text-[10px] text-slate-400 font-medium">
                🔓 Авторасчёт
              </span>
            </div>
            <div class="relative">
              <input
                v-model="formActualCost"
                @input="onActualCostInput"
                type="text"
                inputmode="decimal"
                placeholder="0.00"
                class="w-full h-12 px-4 rounded-xl border text-lg font-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                :class="isCustomCost
                  ? 'border-emerald-500/80 bg-emerald-50/30 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100'"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₽
              </span>
            </div>

            <div
              v-if="discountInfo?.hasDiscount"
              class="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2"
            >
              <Sparkles class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div class="text-xs text-emerald-900 dark:text-emerald-200">
                <div class="font-bold">🎉 Цена литра с учётом скидки: {{ discountInfo.effectivePrice }} ₽/л</div>
                <div class="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                  Расчётная сумма: {{ formatCurrency(calculatedCost, true) }} • Ваша выгода: −{{ formatCurrency(discountInfo.diff, true) }} (−{{ discountInfo.percent }}%)
                </div>
              </div>
            </div>
            <div
              v-else-if="discountInfo?.hasSurcharge"
              class="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200"
            >
              <div class="font-bold">Фактическая цена литра: {{ discountInfo.effectivePrice }} ₽/л</div>
              <div class="mt-0.5">+{{ formatCurrency(discountInfo.diff, true) }} к расчётной сумме</div>
            </div>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <input v-model="formIsFullTank" id="isFullTankCheck" type="checkbox" class="w-5 h-5 rounded-lg text-blue-600 focus:ring-blue-500 border-slate-300 dark:border-slate-700" />
                <label for="isFullTankCheck" class="text-xs font-bold text-slate-900 dark:text-slate-100 cursor-pointer">Заправка до полного бака</label>
              </div>
              <div v-if="liveConsumption" class="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300">
                Расход: {{ liveConsumption }} л/100 км
              </div>
            </div>
            <p v-if="!formIsFullTank" class="text-[11px] text-slate-500 dark:text-slate-400">
              Дозаправка: литры и пробег будут учтены при следующей заправке до полного бака.
            </p>
            <label class="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input v-model="formIsMissedPrevious" type="checkbox" class="w-4 h-4 mt-0.5 rounded text-blue-600" />
              <span>Предыдущая заправка была пропущена — не рассчитывать расход для этой отсечки</span>
            </label>
          </div>

          <div>
            <input ref="photoInput" type="file" accept="image/*" capture="environment" class="hidden" @change="onPhotoSelected" />
            <button type="button" @click="photoInput?.click()" class="w-full h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800">
              <Camera class="w-4 h-4" />
              {{ photoDataUrl ? 'Заменить фото чека' : 'Прикрепить фото чека' }}
            </button>
            <div v-if="photoDataUrl" class="relative mt-2">
              <img :src="photoDataUrl" alt="Фото чека" class="w-full max-h-56 object-contain rounded-xl bg-slate-100 dark:bg-slate-800" />
              <button type="button" @click="photoDataUrl = ''" title="Удалить фото" class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center">
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Комментарий / АЗС</label>
            <input
              v-model="formNotes"
              type="text"
              placeholder="Лукойл, Роснефть, трасса М4..."
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 mt-2">
          <button
            @click="isRefuelModalOpen = false"
            type="button"
            class="flex-1 h-12 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Отмена
          </button>
          <button
            @click="onSave"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-blue-500/25 disabled:opacity-50"
          >
            <Check class="w-4 h-4 stroke-[2.5]" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Сохранить' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

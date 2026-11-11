<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  isCarModalOpen,
  editingCar,
  saveCar
} from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { ExtraPurchaseCost, FuelType } from '../types';
import {
  Car,
  X,
  Plus,
  Trash2,
  Check
} from 'lucide-vue-next';

const fuelTypes: FuelType[] = ['ДТ', '92', '95', '95+', '100', '100+'];

// Form State
const name = ref('');
const year = ref<string | number>('');
const plateNumber = ref('');
const vin = ref('');
const defaultFuelType = ref<string>('95');
const tankVolume = ref<string | number>(60);
const purchaseDate = ref(new Date().toISOString().split('T')[0]);
const purchaseMileage = ref<string | number>('');
const currentMileage = ref<string | number>('');
const purchasePrice = ref<string | number>('');
const selectionServiceCost = ref<string | number>('');
const extraCosts = ref<ExtraPurchaseCost[]>([]);
const notes = ref('');

watch(isCarModalOpen, (isOpen) => {
  if (isOpen) {
    if (editingCar.value) {
      const c = editingCar.value;
      name.value = c.name;
      year.value = c.year || '';
      plateNumber.value = c.plateNumber || '';
      vin.value = c.vin || '';
      defaultFuelType.value = c.defaultFuelType || '95';
      tankVolume.value = c.tankVolume || 60;
      purchaseDate.value = c.purchaseDate || new Date().toISOString().split('T')[0];
      purchaseMileage.value = c.purchaseMileage;
      currentMileage.value = c.currentMileage || c.purchaseMileage;
      purchasePrice.value = c.purchasePrice;
      selectionServiceCost.value = c.selectionServiceCost || '';
      extraCosts.value = c.extraPurchaseCosts ? JSON.parse(JSON.stringify(c.extraPurchaseCosts)) : [];
      notes.value = c.notes || '';
    } else {
      // New car defaults
      name.value = '';
      year.value = '';
      plateNumber.value = '';
      vin.value = '';
      defaultFuelType.value = '95';
      tankVolume.value = 60;
      purchaseDate.value = new Date().toISOString().split('T')[0];
      purchaseMileage.value = '';
      currentMileage.value = '';
      purchasePrice.value = '';
      selectionServiceCost.value = '';
      extraCosts.value = [];
      notes.value = '';
    }
  }
});

function addExtraCostRow() {
  extraCosts.value.push({
    id: `extra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: '',
    cost: 0
  });
}

function removeExtraCostRow(index: number) {
  extraCosts.value.splice(index, 1);
}

async function onSubmit() {
  if (!name.value.trim()) return;

  const pMileage = parseInputNumber(purchaseMileage.value);
  const cMileage = currentMileage.value ? parseInputNumber(currentMileage.value) : pMileage;

  // Filter valid extra costs
  const validExtraCosts = extraCosts.value
    .filter(row => row.name.trim() || row.cost > 0)
    .map(row => ({
      ...row,
      cost: parseInputNumber(row.cost)
    }));

  await saveCar({
    id: editingCar.value?.id,
    name: name.value.trim(),
    year: year.value ? parseInputNumber(year.value) : undefined,
    plateNumber: plateNumber.value.trim() || undefined,
    vin: vin.value.trim() || null,
    status: editingCar.value?.status || 'active',
    purchaseDate: purchaseDate.value,
    purchaseMileage: pMileage,
    currentMileage: cMileage,
    purchasePrice: parseInputNumber(purchasePrice.value),
    selectionServiceCost: parseInputNumber(selectionServiceCost.value),
    tankVolume: parseInputNumber(tankVolume.value) || 60,
    defaultFuelType: defaultFuelType.value,
    notes: notes.value.trim() || null,
    extraPurchaseCosts: validExtraCosts
  });

  isCarModalOpen.value = false;
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
      v-if="isCarModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isCarModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Car class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
                {{ editingCar ? 'Редактировать автомобиль' : 'Новый автомобиль в гараж' }}
              </h3>
              <p class="text-[11px] text-slate-500">
                Основные параметры и стоимость приобретения
              </p>
            </div>
          </div>
          <button
            @click="isCarModalOpen = false"
            class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Form Scroll Area -->
        <form @submit.prevent="onSubmit" class="space-y-4 overflow-y-auto flex-1 pr-1 py-1">
          <!-- 1. Name & Year -->
          <div class="grid grid-cols-3 gap-2.5">
            <div class="col-span-2 space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Марка и модель *
              </label>
              <input
                v-model="name"
                type="text"
                required
                placeholder="напр. Chevrolet Lacetti"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Год выпуска
              </label>
              <input
                v-model="year"
                type="number"
                placeholder="2009"
                class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- 2. Plate & VIN -->
          <div class="grid grid-cols-2 gap-2.5">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Госномер
              </label>
              <input
                v-model="plateNumber"
                type="text"
                placeholder="А 777 АА 77"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                VIN-код
              </label>
              <input
                v-model="vin"
                type="text"
                placeholder="KL1..."
                class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono uppercase text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- 3. Fuel Type & Tank Volume -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Основное топливо по умолчанию
              </label>
              <span class="text-xs text-slate-400">Бак: {{ tankVolume || 60 }} л</span>
            </div>

            <!-- Chips -->
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="ft in fuelTypes"
                :key="ft"
                type="button"
                @click="defaultFuelType = ft"
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95"
                :class="defaultFuelType === ft
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
              >
                {{ ft }}
              </button>

              <div class="ml-auto w-24">
                <input
                  v-model="tankVolume"
                  type="number"
                  placeholder="60 л"
                  title="Объём бака в литрах"
                  class="w-full h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-right text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          <!-- 4. Purchase Date & Purchase Mileage -->
          <div class="grid grid-cols-2 gap-2.5">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Дата покупки
              </label>
              <input
                v-model="purchaseDate"
                type="date"
                required
                class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Пробег при покупке, км *
              </label>
              <input
                v-model="purchaseMileage"
                type="text"
                inputmode="decimal"
                required
                placeholder="напр. 130 712"
                class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- 5. Current Mileage (optional override) -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Текущий пробег автомобиля, км
              </label>
              <span class="text-[11px] text-slate-400">
                Автоматически обновляется по чекам
              </span>
            </div>
            <input
              v-model="currentMileage"
              type="text"
              inputmode="decimal"
              placeholder="Оставьте пустым, если равен пробегу при покупке"
              class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <!-- 6. Purchase Price & Selection Cost -->
          <div class="grid grid-cols-2 gap-2.5">
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Стоимость машины, ₽
              </label>
              <input
                v-model="purchasePrice"
                type="text"
                inputmode="decimal"
                placeholder="напр. 360 000"
                class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div class="space-y-1">
              <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                Услуги автоподбора, ₽
              </label>
              <input
                v-model="selectionServiceCost"
                type="text"
                inputmode="decimal"
                placeholder="напр. 25 000"
                class="w-full h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <!-- 7. Dynamic Extra Purchase Costs -->
          <div class="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Дополнительные расходы при покупке
                </label>
                <p class="text-[11px] text-slate-400">
                  Перегон, оформление, регистрация в ГИБДД
                </p>
              </div>
              <button
                @click="addExtraCostRow"
                type="button"
                class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>Добавить строку</span>
              </button>
            </div>

            <div v-if="extraCosts.length > 0" class="space-y-2">
              <div
                v-for="(row, idx) in extraCosts"
                :key="row.id || idx"
                class="flex items-center gap-2"
              >
                <input
                  v-model="row.name"
                  type="text"
                  placeholder="Статья расхода (напр. Оформление ГИБДД)"
                  class="flex-1 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div class="w-28 relative">
                  <input
                    v-model="row.cost"
                    type="text"
                    inputmode="decimal"
                    placeholder="0"
                    class="w-full h-9 pl-2 pr-5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold font-mono text-right text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span class="absolute right-2 top-2.5 text-xs text-slate-400 font-mono">₽</span>
                </div>
                <button
                  @click="removeExtraCostRow(idx)"
                  type="button"
                  class="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  title="Удалить строку"
                >
                  <Trash2 class="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <!-- 8. Notes -->
          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Заметки об автомобиле
            </label>
            <textarea
              v-model="notes"
              rows="2"
              placeholder="Комплектация, код краски кузова, особенности..."
              class="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            ></textarea>
          </div>

          <!-- Submit Button -->
          <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              class="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition text-sm"
            >
              <Check class="w-4 h-4 stroke-[3]" />
              <span>{{ editingCar ? 'Сохранить изменения' : 'Добавить автомобиль' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

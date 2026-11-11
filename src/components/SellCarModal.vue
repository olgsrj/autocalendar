<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  isSellCarModalOpen,
  editingCar,
  saveCar,
  showToast
} from '../services/store';
import { parseInputNumber } from '../services/calculations';
import { Tag, X, Check, RotateCcw } from 'lucide-vue-next';

const soldDate = ref(new Date().toISOString().split('T')[0]);
const soldMileage = ref<string | number>('');
const soldPrice = ref<string | number>('');

watch(isSellCarModalOpen, (isOpen) => {
  if (isOpen && editingCar.value) {
    soldDate.value = editingCar.value.soldDate || new Date().toISOString().split('T')[0];
    soldMileage.value = editingCar.value.soldMileage || editingCar.value.currentMileage || '';
    soldPrice.value = editingCar.value.soldPrice || '';
  }
});

async function onConfirmSold() {
  if (!editingCar.value) return;

  const car = editingCar.value;
  try {
    await saveCar({
      ...car,
      status: 'sold',
      soldDate: soldDate.value,
      soldMileage: parseInputNumber(soldMileage.value),
      soldPrice: parseInputNumber(soldPrice.value)
    });

    isSellCarModalOpen.value = false;
    showToast('Автомобиль помечен проданным и перемещён в архив');
  } catch (error) {
    console.error('Failed to mark car as sold:', error);
    showToast('Не удалось сохранить продажу автомобиля');
  }
}

async function onReactivateCar() {
  if (!editingCar.value) return;

  const car = editingCar.value;
  try {
    await saveCar({
      ...car,
      status: 'active',
      soldDate: null,
      soldMileage: null,
      soldPrice: null
    });

    isSellCarModalOpen.value = false;
    showToast('Автомобиль возвращён из архива в активные');
  } catch (error) {
    console.error('Failed to reactivate car:', error);
    showToast('Не удалось вернуть автомобиль из архива');
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
      v-if="isSellCarModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isSellCarModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Tag class="w-4 h-4" />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
                {{ editingCar?.status === 'sold' ? 'Статус автомобиля' : 'Продажа автомобиля' }}
              </h3>
              <p class="text-[11px] text-slate-500">
                {{ editingCar?.name }}
              </p>
            </div>
          </div>
          <button
            @click="isSellCarModalOpen = false"
            class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- If currently active, show sell form -->
        <form v-if="editingCar?.status !== 'sold'" @submit.prevent="onConfirmSold" class="space-y-3.5">
          <p class="text-xs text-slate-600 dark:text-slate-400">
            Зафиксируйте финальную дату, пробег и сумму продажи для корректного подведения итогов владения:
          </p>

          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Дата продажи
            </label>
            <input
              v-model="soldDate"
              type="date"
              required
              class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Пробег на момент продажи, км
            </label>
            <input
              v-model="soldMileage"
              type="text"
              inputmode="decimal"
              required
              placeholder="напр. 203 408"
              class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div class="space-y-1">
            <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Цена продажи автомобиля, ₽
            </label>
            <input
              v-model="soldPrice"
              type="text"
              inputmode="decimal"
              placeholder="напр. 450 000"
              class="w-full h-11 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              class="w-full h-12 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 active:scale-[0.98] transition text-sm"
            >
              <Check class="w-4 h-4 stroke-[3]" />
              <span>Пометить проданным</span>
            </button>
          </div>
        </form>

        <!-- If currently sold, show un-sell button -->
        <div v-else class="space-y-4">
          <div class="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
            Автомобиль сейчас находится в архиве со статусом <b>«Продано»</b>.
          </div>

          <button
            @click="onReactivateCar"
            type="button"
            class="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition text-sm"
          >
            <RotateCcw class="w-4 h-4" />
            <span>Вернуть в активные автомобили</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

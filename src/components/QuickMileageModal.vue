<script setup lang="ts">
import { ref, watch } from 'vue';
import {
  currentMileage,
  isQuickMileageModalOpen,
  updateManualMileage
} from '../services/store';
import { parseInputNumber, formatKm } from '../services/calculations';
import { Gauge, X, Check } from 'lucide-vue-next';

const inputKm = ref('');
const isSubmitting = ref(false);

watch(
  () => isQuickMileageModalOpen.value,
  (open) => {
    if (open) {
      inputKm.value = String(currentMileage.value || '');
    }
  }
);

async function onSave() {
  const km = parseInputNumber(inputKm.value);
  if (!km || km <= 0) return;

  isSubmitting.value = true;
  await updateManualMileage(km);
  isSubmitting.value = false;
  isQuickMileageModalOpen.value = false;
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
      v-if="isQuickMileageModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      @click.self="isQuickMileageModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Gauge class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              Текущий пробег
            </h3>
          </div>
          <button
            @click="isQuickMileageModalOpen = false"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="mb-4">
          <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
            Показания одометра (км)
          </label>
          <div class="relative">
            <input
              v-model="inputKm"
              type="text"
              inputmode="numeric"
              placeholder="203408"
              class="w-full h-12 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-bold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autofocus
            />
            <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-medium">
              км
            </span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
            Текущее значение: {{ formatKm(currentMileage) }}
          </p>
        </div>

        <div class="flex items-center gap-2 pt-2">
          <button
            @click="isQuickMileageModalOpen = false"
            type="button"
            class="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Отмена
          </button>
          <button
            @click="onSave"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Check class="w-4 h-4" />
            <span>Сохранить</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

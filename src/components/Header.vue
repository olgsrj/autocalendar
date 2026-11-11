<script setup lang="ts">
import { computed } from 'vue';
import {
  activeCar,
  isGarageModalOpen,
  currentTab,
  navigateTo,
  navigateBack
} from '../services/store';
import { Car, Settings, ChevronDown, ArrowLeft } from 'lucide-vue-next';

const isSettings = computed(() => currentTab.value === 'settings');

function onCarSelectClick() {
  isGarageModalOpen.value = true;
}

function onSettingsClick() {
  if (isSettings.value) {
    navigateBack();
  } else {
    navigateTo('settings');
  }
}
</script>

<template>
  <header
    class="sticky top-0 z-30 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 transition-colors"
  >
    <div class="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
      <!-- Car Selector Button -->
      <button
        @click="onCarSelectClick"
        type="button"
        class="flex items-center gap-2 px-3 py-1.5 -ml-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95 text-left"
        title="Выбрать автомобиль"
      >
        <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
          <Car class="w-4 h-4" />
        </div>
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5">
            <span class="font-bold text-slate-900 dark:text-slate-100 text-sm tracking-tight truncate max-w-[170px] sm:max-w-[240px]">
              {{ activeCar?.name || 'Гараж пуст' }}
            </span>
            <span
              v-if="activeCar?.status === 'sold'"
              class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
            >
              Продано
            </span>
            <ChevronDown class="w-3.5 h-3.5 text-slate-400" />
          </div>
          <span class="text-[11px] text-slate-500 dark:text-slate-400">
            {{ activeCar ? (activeCar.plateNumber || `${activeCar.year || ''} г.`) : 'Нажмите для добавления' }}
          </span>
        </div>
      </button>

      <!-- Right Action Button: Settings or Back -->
      <button
        @click="onSettingsClick"
        type="button"
        class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
        :title="isSettings ? 'Назад' : 'Настройки и гараж'"
      >
        <ArrowLeft v-if="isSettings" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <Settings v-else class="w-5 h-5" />
      </button>
    </div>
  </header>
</template>

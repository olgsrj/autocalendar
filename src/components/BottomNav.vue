<script setup lang="ts">
import { currentTab, navigateTo, activeMaintenanceRules, activeTireSets, activeInsurances, currentMileage } from '../services/store';
import { computed } from 'vue';
import {
  Home,
  Fuel,
  Wrench,
  Package,
  BarChart3
} from 'lucide-vue-next';

// Calculate attention count for badge on maintenance / home tabs
const attentionCount = computed(() => {
  let count = 0;
  const curKm = currentMileage.value;
  const today = new Date().toISOString().split('T')[0];

  // 1. Maintenance overdue / due soon
  for (const rule of activeMaintenanceRules.value) {
    if (!rule.notifyEnabled) continue;
    let isUrgent = false;
    if (rule.intervalKm && rule.lastReplacedKm) {
      const remainingKm = rule.lastReplacedKm + rule.intervalKm - curKm;
      if (remainingKm <= 1000) isUrgent = true;
    }
    if (rule.intervalDays && rule.lastReplacedDate) {
      const start = new Date(rule.lastReplacedDate).getTime();
      const nextDate = start + rule.intervalDays * 24 * 3600 * 1000;
      const remainingDays = Math.ceil((nextDate - new Date(today).getTime()) / (24 * 3600 * 1000));
      if (remainingDays <= 30) isUrgent = true;
    }
    if (isUrgent) count++;
  }

  // 2. Tires age >= 6
  const currentYear = new Date().getFullYear();
  for (const tire of activeTireSets.value) {
    if (!tire.isArchived && (currentYear - tire.manufactureYear >= (tire.recommendedMaxAgeYears || 6))) {
      count++;
    }
  }

  // 3. Insurance <= 30 days
  for (const ins of activeInsurances.value) {
    const end = new Date(ins.endDate).getTime();
    const remainingDays = Math.ceil((end - new Date(today).getTime()) / (24 * 3600 * 1000));
    if (remainingDays <= 30) count++;
  }

  return count;
});
</script>

<template>
  <nav
    class="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 transition-colors pb-safe"
  >
    <div class="max-w-xl mx-auto px-2 h-16 flex items-center justify-around">
      <!-- 1. Home -->
      <button
        @click="navigateTo('home')"
        type="button"
        class="relative flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition active:scale-95"
        :class="currentTab === 'home' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
      >
        <Home class="w-5 h-5 mb-1" :class="currentTab === 'home' ? 'stroke-[2.5]' : 'stroke-2'" />
        <span>Главная</span>
      </button>

      <!-- 2. Refuelings -->
      <button
        @click="navigateTo('refuelings')"
        type="button"
        class="relative flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition active:scale-95"
        :class="currentTab === 'refuelings' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
      >
        <Fuel class="w-5 h-5 mb-1" :class="currentTab === 'refuelings' ? 'stroke-[2.5]' : 'stroke-2'" />
        <span>Заправки</span>
      </button>

      <!-- 3. Maintenance -->
      <button
        @click="navigateTo('maintenance')"
        type="button"
        class="relative flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition active:scale-95"
        :class="currentTab === 'maintenance' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
      >
        <div class="relative">
          <Wrench class="w-5 h-5 mb-1" :class="currentTab === 'maintenance' ? 'stroke-[2.5]' : 'stroke-2'" />
          <span
            v-if="attentionCount > 0"
            class="absolute -top-1 -right-2.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow"
          >
            {{ attentionCount > 9 ? '9+' : attentionCount }}
          </span>
        </div>
        <span>ТО и Сервис</span>
      </button>

      <!-- 4. Parts & Tires -->
      <button
        @click="navigateTo('parts_tires')"
        type="button"
        class="relative flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition active:scale-95"
        :class="currentTab === 'parts_tires' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
      >
        <Package class="w-5 h-5 mb-1" :class="currentTab === 'parts_tires' ? 'stroke-[2.5]' : 'stroke-2'" />
        <span>Склад и Шины</span>
      </button>

      <!-- 5. Analytics -->
      <button
        @click="navigateTo('analytics')"
        type="button"
        class="relative flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-medium transition active:scale-95"
        :class="currentTab === 'analytics' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
      >
        <BarChart3 class="w-5 h-5 mb-1" :class="currentTab === 'analytics' ? 'stroke-[2.5]' : 'stroke-2'" />
        <span>Аналитика</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
</style>

<script setup lang="ts">
import {
  cars,
  activeCarId,
  isGarageModalOpen,
  setActiveCar,
  navigateTo,
  isCarModalOpen,
  editingCar
} from '../services/store';
import { formatKm } from '../services/calculations';
import { Car, Plus, ChevronRight, X, Check } from 'lucide-vue-next';

function selectCar(id: string) {
  setActiveCar(id);
  isGarageModalOpen.value = false;
}

function openAddCar() {
  editingCar.value = null;
  isGarageModalOpen.value = false;
  isCarModalOpen.value = true;
}

function goToGarageManagement() {
  isGarageModalOpen.value = false;
  navigateTo('settings');
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
      v-if="isGarageModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isGarageModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Car class="w-4 h-4" />
            </div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
              Мой гараж
            </h3>
          </div>
          <button
            @click="isGarageModalOpen = false"
            class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Cars List -->
        <div class="space-y-2.5 overflow-y-auto flex-1 pr-1 py-1">
          <div
            v-for="car in cars"
            :key="car.id"
            @click="selectCar(car.id)"
            class="p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between"
            :class="[
              car.id === activeCarId
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 dark:border-blue-600 ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50',
              car.status === 'sold' ? 'opacity-70' : ''
            ]"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center text-slate-700 dark:text-slate-300"
                :class="car.id === activeCarId ? 'bg-blue-600 text-white dark:bg-blue-500' : 'bg-slate-100 dark:bg-slate-800'"
              >
                <Car class="w-5 h-5" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {{ car.name }}
                  </h4>
                  <span
                    v-if="car.status === 'sold'"
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
                  >
                    Продано
                  </span>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {{ formatKm(car.currentMileage) }}
                  <span v-if="car.year"> • {{ car.year }} г.</span>
                  <span v-if="car.plateNumber"> • {{ car.plateNumber }}</span>
                </div>
              </div>
            </div>

            <div v-if="car.id === activeCarId" class="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
              <Check class="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 mt-2">
          <button
            @click="openAddCar"
            type="button"
            class="w-full h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-semibold rounded-xl flex items-center justify-center gap-2 transition active:scale-[0.98] text-sm"
          >
            <Plus class="w-4 h-4" />
            <span>+ Добавить новый автомобиль</span>
          </button>

          <button
            @click="goToGarageManagement"
            type="button"
            class="w-full h-9 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center gap-1 transition"
          >
            <span>Управление гаражом и настройками</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

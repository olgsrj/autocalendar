<script setup lang="ts">
import { ref, watch } from 'vue';
import { db } from '../db';
import { activeCar, loadAllData, showToast } from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { MaintenanceRule } from '../types';
import { ClipboardList, X, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  ruleToEdit?: MaintenanceRule | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const formName = ref('');
const formIntervalKm = ref('');
const formIntervalDays = ref('');
const formLastKm = ref('');
const formLastDate = ref('');
const formNotify = ref(true);
const isSubmitting = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    if (props.ruleToEdit) {
      formName.value = props.ruleToEdit.name;
      formIntervalKm.value = props.ruleToEdit.intervalKm ? String(props.ruleToEdit.intervalKm) : '';
      formIntervalDays.value = props.ruleToEdit.intervalDays ? String(props.ruleToEdit.intervalDays) : '';
      formLastKm.value = props.ruleToEdit.lastReplacedKm ? String(props.ruleToEdit.lastReplacedKm) : '';
      formLastDate.value = props.ruleToEdit.lastReplacedDate || '';
      formNotify.value = props.ruleToEdit.notifyEnabled;
    } else {
      formName.value = '';
      formIntervalKm.value = '10000';
      formIntervalDays.value = '365';
      formLastKm.value = String(activeCar.value?.currentMileage || '');
      formLastDate.value = new Date().toISOString().split('T')[0];
      formNotify.value = true;
    }
  }
);

async function onSave() {
  const name = formName.value.trim();
  if (!name || !activeCar.value) return;

  isSubmitting.value = true;
  try {
    const id = props.ruleToEdit?.id || `rule-${Date.now()}`;
    const rule: MaintenanceRule = {
      id,
      carId: activeCar.value.id,
      name,
      intervalKm: formIntervalKm.value ? parseInputNumber(formIntervalKm.value) : null,
      intervalDays: formIntervalDays.value ? parseInputNumber(formIntervalDays.value) : null,
      lastReplacedKm: formLastKm.value ? parseInputNumber(formLastKm.value) : null,
      lastReplacedDate: formLastDate.value || null,
      notifyEnabled: formNotify.value,
      notes: null
    };

    await db.maintenanceRules.put(rule);
    await loadAllData();
    showToast(props.ruleToEdit ? 'Узел ТО обновлен' : 'Узел ТО добавлен');
    emit('close');
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
      v-if="isOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <ClipboardList class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              {{ ruleToEdit ? 'Редактировать регламент ТО' : 'Новый узел ТО' }}
            </h3>
          </div>
          <button
            @click="emit('close')"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3.5">
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Название узла / работы *
            </label>
            <input
              v-model="formName"
              type="text"
              placeholder="Моторное масло + масляный фильтр"
              class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Интервал (км)
              </label>
              <input
                v-model="formIntervalKm"
                type="text"
                inputmode="numeric"
                placeholder="7500"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Интервал (дней)
              </label>
              <input
                v-model="formIntervalDays"
                type="text"
                inputmode="numeric"
                placeholder="365"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Прошлый пробег (км)
              </label>
              <input
                v-model="formLastKm"
                type="text"
                inputmode="numeric"
                placeholder="192078"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата прошлой замены
              </label>
              <input
                v-model="formLastDate"
                type="date"
                class="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              v-model="formNotify"
              id="notifyCheck"
              type="checkbox"
              class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
            />
            <label for="notifyCheck" class="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Показывать в блоке «Требует внимания» при просрочке
            </label>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 mt-4">
          <button
            @click="emit('close')"
            type="button"
            class="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Отмена
          </button>
          <button
            @click="onSave"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Сохранить' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

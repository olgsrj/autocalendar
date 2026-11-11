<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { db } from '../db';
import {
  activeServiceEvents,
  isServiceModalOpen,
  editingServiceEvent,
  preselectedRuleForService,
  recalculateMaintenanceRulesForCar,
  loadAllData,
  showToast
} from '../services/store';
import { formatKm, formatDateRu, formatCurrency } from '../services/calculations';
import type { MaintenanceRule, ServiceEvent } from '../types';
import { CheckCircle2, Plus, Link2, X } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  rule: MaintenanceRule | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const mode = ref<'choose' | 'linkExisting'>('choose');
const sortedEvents = computed(() => [...activeServiceEvents.value].sort((a, b) =>
  b.date.localeCompare(a.date) || (b.mileage || 0) - (a.mileage || 0)
));
watch(() => props.isOpen, open => {
  if (open) mode.value = 'choose';
});

function createNewOrder() {
  if (!props.rule) return;
  editingServiceEvent.value = null;
  preselectedRuleForService.value = props.rule;
  isServiceModalOpen.value = true;
  emit('close');
}

async function linkToExisting(event: ServiceEvent) {
  if (!props.rule) return;
  const ruleId = props.rule.id;
  const items = event.items.map(item => ({ ...item }));
  if (!items.some(item => item.maintenanceRuleId === ruleId)) {
    if (items.length > 0) items[0].maintenanceRuleId = ruleId;
    else items.push({ id: `work-${Date.now()}`, name: `Замена: ${props.rule.name}`, cost: 0, maintenanceRuleId: ruleId });
    await db.serviceEvents.update(event.id, { items });
  }
  await recalculateMaintenanceRulesForCar(event.carId, [ruleId]);
  await loadAllData();
  showToast(`Узел «${props.rule.name}» привязан к заказ-наряду от ${formatDateRu(event.date)}`);
  emit('close');
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
      v-if="isOpen && rule"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2 class="w-4 h-4" />
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Подтвердить проведение ТО
              </h3>
              <p class="text-[11px] text-slate-500 truncate max-w-[220px]">
                {{ rule.name }}
              </p>
            </div>
          </div>
          <button
            @click="emit('close')"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div v-if="mode === 'choose'" class="space-y-3 py-2">
          <p class="text-xs text-slate-600 dark:text-slate-400">
            Выберите, как зафиксировать проведённое обслуживание:
          </p>

          <!-- Option A: Create New Service Order -->
          <button
            @click="createNewOrder"
            type="button"
            class="w-full p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-left transition active:scale-[0.98]"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Plus class="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Создать новый заказ-наряд
                </h4>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Предзаполнит работу «{{ rule.name }}» и предложит списать запчасти с полки
                </p>
              </div>
            </div>
          </button>

          <!-- Option B: Link Existing Order -->
          <button
            @click="mode = 'linkExisting'"
            type="button"
            class="w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition active:scale-[0.98]"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
                <Link2 class="w-5 h-5" />
              </div>
              <div>
                <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Привязать к существующему заказу
                </h4>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Если визит в сервис уже был внесён ранее
                </p>
              </div>
            </div>
          </button>
        </div>

        <!-- Mode: Link to Existing Order List -->
        <div v-else class="space-y-2 overflow-y-auto flex-1 pr-1 py-1">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-slate-500">Выберите заказ-наряд:</span>
            <button
              @click="mode = 'choose'"
              type="button"
              class="text-xs text-blue-600 hover:underline"
            >
              ← Назад
            </button>
          </div>

          <button
            v-for="event in sortedEvents"
            :key="event.id"
            type="button"
            @click="linkToExisting(event)"
            class="w-full text-left p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition text-xs space-y-1"
          >
            <div class="flex items-center justify-between">
              <span class="font-bold text-slate-900 dark:text-slate-100">
                {{ formatDateRu(event.date) }} • {{ formatKm(event.mileage) }}
              </span>
              <span class="font-bold text-slate-700 dark:text-slate-300">
                {{ formatCurrency(event.totalLaborCost) }}
              </span>
            </div>
            <div class="text-slate-500 truncate">
              🏢 {{ event.organization }} • {{ event.items.map(i => i.name).join(', ') }}
            </div>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

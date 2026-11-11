<script setup lang="ts">
import { ref, watch } from 'vue';
import { activeCar, saveTireSet, mountTireSet } from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { TireSet, TireSeason } from '../types';
import { Disc, X, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  tireToEdit?: TireSet | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const formName = ref('');
const formSeason = ref<TireSeason>('summer');
const formDimension = ref('195/55 R15 85V');
const formYear = ref(2020);
const formMaxAge = ref(6);
const formPrice = ref('');
const formDate = ref('');
const formBaseMileage = ref('');
const formIsMounted = ref(false);
const formMountedAtKm = ref('');
const isSubmitting = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    if (props.tireToEdit) {
      const t = props.tireToEdit;
      formName.value = t.name;
      formSeason.value = t.season;
      formDimension.value = t.dimension;
      formYear.value = t.manufactureYear;
      formMaxAge.value = t.recommendedMaxAgeYears || 6;
      formPrice.value = t.purchasePrice ? String(t.purchasePrice) : '';
      formDate.value = t.purchaseDate || '';
      formBaseMileage.value = String(t.baseMileage || 0);
      formIsMounted.value = t.isMounted;
      formMountedAtKm.value = String(t.mountedAtMileage || '');
    } else {
      formName.value = '';
      formSeason.value = 'summer';
      formDimension.value = '195/55 R15';
      formYear.value = new Date().getFullYear();
      formMaxAge.value = 6;
      formPrice.value = '';
      formDate.value = new Date().toISOString().split('T')[0];
      formBaseMileage.value = '0';
      formIsMounted.value = false;
      formMountedAtKm.value = String(activeCar.value?.currentMileage || '');
    }
  }
);

async function onSave() {
  const name = formName.value.trim();
  if (!name || !activeCar.value) return;

  isSubmitting.value = true;
  try {
    const wasMounted = props.tireToEdit?.isMounted || false;
    const mountedAtMileage = parseInputNumber(formMountedAtKm.value) || activeCar.value.currentMileage;
    await saveTireSet({
      id: props.tireToEdit?.id,
      name,
      season: formSeason.value,
      dimension: formDimension.value.trim() || '195/55 R15',
      manufactureYear: formYear.value,
      recommendedMaxAgeYears: formMaxAge.value || 6,
      purchasePrice: parseInputNumber(formPrice.value),
      purchaseDate: formDate.value || null,
      baseMileage: parseInputNumber(formBaseMileage.value),
      isMounted: wasMounted && formIsMounted.value,
      mountedAtMileage
    });
    if (formIsMounted.value && !wasMounted && props.tireToEdit?.id) {
      await mountTireSet(props.tireToEdit.id, mountedAtMileage);
    }

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
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Disc class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              {{ tireToEdit ? 'Редактировать комплект шин' : 'Новый комплект шин' }}
            </h3>
          </div>
          <button
            @click="emit('close')"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3.5 overflow-y-auto flex-1 pr-1 py-1">
          <!-- Season Selector -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Сезон *
            </label>
            <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
              <button
                @click="formSeason = 'summer'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formSeason === 'summer' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                ☀️ Лето
              </button>
              <button
                @click="formSeason = 'winter_spikes'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formSeason === 'winter_spikes' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                ❄️ Шипы
              </button>
              <button
                @click="formSeason = 'winter_friction'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formSeason === 'winter_friction' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                ❄️ Липучка
              </button>
            </div>
          </div>

          <!-- Name & Dimension -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Бренд и модель шин *
            </label>
            <input
              v-model="formName"
              type="text"
              placeholder="Hankook Ventus V12 evo2 K120"
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Размерность
              </label>
              <input
                v-model="formDimension"
                type="text"
                placeholder="195/55 R15 85V"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Год выпуска (DOT) *
              </label>
              <input
                v-model="formYear"
                type="number"
                placeholder="2020"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold text-center"
              />
            </div>
          </div>

          <!-- Price & Date -->
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Стоимость комплекта (₽)
              </label>
              <input
                v-model="formPrice"
                type="text"
                inputmode="decimal"
                placeholder="17300"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата покупки
              </label>
              <input
                v-model="formDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>

          <!-- Base Mileage -->
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Начальный пробег (км)
              </label>
              <input
                v-model="formBaseMileage"
                type="text"
                inputmode="numeric"
                placeholder="0"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Макс. срок службы (лет)
              </label>
              <input
                v-model="formMaxAge"
                type="number"
                placeholder="6"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs text-center"
              />
            </div>
          </div>

          <!-- Mounted Checkbox -->
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <label for="mountedCheck" class="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
              Установлены на авто прямо сейчас
            </label>
            <input
              v-model="formIsMounted"
              id="mountedCheck"
              type="checkbox"
              class="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 mt-2">
          <button
            @click="emit('close')"
            type="button"
            class="flex-1 h-11 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Отмена
          </button>
          <button
            @click="onSave"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Сохранить шины' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

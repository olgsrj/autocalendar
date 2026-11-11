<script setup lang="ts">
import { ref, watch } from 'vue';
import { activeCar, saveInsurance, showToast } from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { InsuranceDocument } from '../types';
import { ShieldCheck, X, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  insuranceToEdit?: InsuranceDocument | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const formCompany = ref('Тинькофф Страхование');
const formNumber = ref('');
const formStartDate = ref('');
const formEndDate = ref('');
const formCost = ref('');
const formIncludeExpenses = ref(true);
const formNotes = ref('');
const formFileUrl = ref<string | null>(null);
const formFileName = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const isSubmitting = ref(false);

// Auto set end date to +1 year - 1 day
watch(formStartDate, (start) => {
  if (start && !props.insuranceToEdit) {
    const d = new Date(start);
    d.setFullYear(d.getFullYear() + 1);
    d.setDate(d.getDate() - 1);
    formEndDate.value = d.toISOString().split('T')[0];
  }
});

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    const ins = props.insuranceToEdit;
    formCompany.value = ins?.company || 'Тинькофф Страхование';
    formNumber.value = ins?.policyNumber || '';
    formStartDate.value = ins?.startDate || new Date().toISOString().split('T')[0];
    formEndDate.value = ins?.endDate || '';
    formCost.value = ins ? String(ins.cost) : '3500';
    formIncludeExpenses.value = ins?.isIncludedInExpenses ?? true;
    formNotes.value = ins?.notes || '';
    formFileUrl.value = ins?.fileUrl || null;
    formFileName.value = formFileUrl.value ? 'Прикреплённый документ' : '';
    if (!ins) {
      const d = new Date(formStartDate.value);
      d.setFullYear(d.getFullYear() + 1);
      d.setDate(d.getDate() - 1);
      formEndDate.value = d.toISOString().split('T')[0];
    }
  }
);

async function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast('Размер файла не должен превышать 10 МБ');
    return;
  }
  try {
    formFileUrl.value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    formFileName.value = file.name;
  } catch {
    showToast('Не удалось прочитать файл полиса');
  }
}

async function onSave() {
  const number = formNumber.value.trim();
  if (!number || !activeCar.value) return;

  isSubmitting.value = true;
  try {
    await saveInsurance({
      id: props.insuranceToEdit?.id,
      company: formCompany.value.trim() || 'Страховая компания',
      policyNumber: number,
      startDate: formStartDate.value,
      endDate: formEndDate.value,
      cost: parseInputNumber(formCost.value),
      isIncludedInExpenses: formIncludeExpenses.value,
      fileUrl: formFileUrl.value,
      notes: formNotes.value.trim() || null
    });

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
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              {{ insuranceToEdit ? 'Редактировать полис ОСАГО' : 'Новый полис ОСАГО' }}
            </h3>
          </div>
          <button
            @click="emit('close')"
            class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <div class="space-y-3.5 py-1">
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Страховая компания *
            </label>
            <input
              v-model="formCompany"
              type="text"
              placeholder="Тинькофф Страхование, Альфа..."
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Серия и номер полиса *
            </label>
            <input
              v-model="formNumber"
              type="text"
              placeholder="ХХХ 0000000000"
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-mono font-bold focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата начала *
              </label>
              <input
                v-model="formStartDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата окончания *
              </label>
              <input
                v-model="formEndDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Стоимость полиса (₽) *
            </label>
            <div class="relative">
              <input
                v-model="formCost"
                type="text"
                inputmode="decimal"
                placeholder="3294.65"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-base font-black focus:ring-2 focus:ring-emerald-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₽</span>
            </div>
          </div>

          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Фото или PDF полиса (до 10 МБ)
            </label>
            <input
              ref="fileInput"
              type="file"
              accept="image/*,application/pdf"
              class="hidden"
              @change="onFileSelected"
            />
            <button
              type="button"
              class="w-full h-10 rounded-xl border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs font-bold"
              @click="fileInput?.click()"
            >
              {{ formFileName || 'Прикрепить фото / PDF' }}
            </button>
            <button
              v-if="formFileUrl"
              type="button"
              class="text-xs text-red-500 hover:underline"
              @click="formFileUrl = null; formFileName = ''"
            >
              Удалить прикреплённый файл
            </button>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <input
              v-model="formIncludeExpenses"
              id="includeExpCheck"
              type="checkbox"
              class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <label for="includeExpCheck" class="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Учитывать стоимость в общих расходах авто
            </label>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 mt-3">
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
            class="flex-1 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-emerald-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Сохранить полис' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

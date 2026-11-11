<script setup lang="ts">
import { ref, watch } from 'vue';
import { savePart } from '../services/store';
import { parseInputNumber, formatCurrency, formatDateRu } from '../services/calculations';
import type { Part } from '../types';
import { RotateCw, X, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  sourcePart: Part | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const CATEGORIES = [
  'Фильтры и масла',
  'Тормозная система',
  'Подвеска и рулевое',
  'Двигатель и выхлоп',
  'Электрика и свет',
  'Расходная химия/смазки',
  'Кузов и салон',
  'Деталь'
];

const rebuyMode = ref<'bought' | 'wishlist'>('bought');
const formCategory = ref('Деталь');
const formName = ref('');
const formBrand = ref('');
const formPartNumber = ref('');
const formStore = ref('');
const formProductUrl = ref('');
const formQuantity = ref('1');
const formUnitPrice = ref('');
const formTotalPrice = ref('');
const newDate = ref('');
const isSubmitting = ref(false);

watch([formQuantity, formUnitPrice], ([quantity, unitPrice]) => {
  const parsedUnitPrice = parseInputNumber(unitPrice);
  if (parsedUnitPrice > 0) {
    formTotalPrice.value = String((parseInputNumber(quantity) || 1) * parsedUnitPrice);
  }
});

watch(
  () => props.isOpen,
  (open) => {
    if (!open || !props.sourcePart) return;
    const part = props.sourcePart;
    rebuyMode.value = 'bought';
    formCategory.value = part.category;
    formName.value = part.name;
    formBrand.value = part.brand || '';
    formPartNumber.value = part.partNumber || '';
    formStore.value = part.store || '';
    formProductUrl.value = part.productUrl || '';
    formQuantity.value = String(part.quantity || 1);
    formUnitPrice.value = part.unitPrice !== null && part.unitPrice !== undefined
      ? String(part.unitPrice)
      : part.totalPrice !== null ? String(part.totalPrice / (part.quantity || 1)) : '';
    formTotalPrice.value = part.totalPrice !== null ? String(part.totalPrice) : '';
    newDate.value = new Date().toISOString().split('T')[0];
  }
);

async function onConfirm() {
  if (!props.sourcePart) return;
  const name = formName.value.trim();
  if (!name) return;

  isSubmitting.value = true;
  try {
    const isWish = rebuyMode.value === 'wishlist';
    const quantity = parseInputNumber(formQuantity.value) || 1;
    const total = isWish || !formTotalPrice.value ? null : parseInputNumber(formTotalPrice.value);
    const unit = isWish ? null : formUnitPrice.value
      ? parseInputNumber(formUnitPrice.value)
      : total !== null ? total / quantity : null;

    await savePart({
      category: formCategory.value,
      name,
      brand: formBrand.value.trim() || null,
      partNumber: formPartNumber.value.trim() || null,
      store: formStore.value.trim() || null,
      productUrl: formProductUrl.value.trim() || null,
      quantity,
      unitPrice: unit,
      totalPrice: total,
      status: isWish ? 'wishlist' : 'in_stock',
      purchaseDate: isWish ? null : newDate.value || null,
      installedMileage: null,
      installedDate: null,
      serviceEventId: null
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
      v-if="isOpen && sourcePart"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <RotateCw class="w-4 h-4" />
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Вернуть на полку (Купить снова)
              </h3>
              <p class="text-[11px] text-slate-500 truncate max-w-[220px]">
                {{ sourcePart.name }}
                <span v-if="sourcePart.partNumber" class="font-mono">({{ sourcePart.partNumber }})</span>
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

        <div class="space-y-3.5 overflow-y-auto flex-1 pr-1 py-1">
          <div class="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 text-xs">
            <div class="text-slate-500 mb-0.5">Информация о прошлой покупке:</div>
            <div class="font-bold text-slate-800 dark:text-slate-200">
              {{ sourcePart.quantity || 1 }} шт. на {{ formatCurrency(sourcePart.totalPrice) }}
              <span v-if="sourcePart.purchaseDate"> ({{ formatDateRu(sourcePart.purchaseDate) }})</span>
              <span v-if="sourcePart.store"> • {{ sourcePart.store }}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
            <button
              @click="rebuyMode = 'bought'"
              type="button"
              class="py-2 rounded-lg transition"
              :class="rebuyMode === 'bought' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
            >
              ✅ Уже куплено
            </button>
            <button
              @click="rebuyMode = 'wishlist'"
              type="button"
              class="py-2 rounded-lg transition"
              :class="rebuyMode === 'wishlist' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
            >
              📝 В список покупок
            </button>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Категория *</label>
            <select
              v-model="formCategory"
              class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold"
            >
              <option v-for="category in CATEGORIES" :key="category" :value="category">{{ category }}</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Название детали *</label>
            <input
              v-model="formName"
              type="text"
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Бренд</label>
              <input
                v-model="formBrand"
                type="text"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Артикул</label>
              <input
                v-model="formPartNumber"
                type="text"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Магазин</label>
            <input
              v-model="formStore"
              type="text"
              placeholder="autodoc.ru, OZON..."
              class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Ссылка на товар</label>
            <input
              v-model="formProductUrl"
              type="url"
              placeholder="https://..."
              class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>

          <template v-if="rebuyMode === 'bought'">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Кол-во (шт)</label>
                <input
                  v-model="formQuantity"
                  type="number"
                  min="1"
                  class="w-full h-10 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-bold text-xs"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Цена за ед. (₽)</label>
                <input
                  v-model="formUnitPrice"
                  type="text"
                  inputmode="decimal"
                  class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-bold text-xs"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Итого (₽) *</label>
                <input
                  v-model="formTotalPrice"
                  type="text"
                  inputmode="decimal"
                  class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-black text-xs text-amber-600 dark:text-amber-400"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Дата покупки</label>
              <input
                v-model="newDate"
                type="date"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </template>

          <p class="text-[11px] text-slate-500 italic">
            Исходная запись в «Установлено» останется неизменной. На полке появится новая копия детали.
          </p>
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
            @click="onConfirm"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Создание...' : 'Готово' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

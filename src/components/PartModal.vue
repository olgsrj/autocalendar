<script setup lang="ts">
import { ref, watch } from 'vue';
import { activeCar, savePart } from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { Part, PartStatus } from '../types';
import { Package, X, Check } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  partToEdit?: Part | null;
  defaultStatus?: PartStatus;
  defaultPurchaseDate?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved', partId: string): void;
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

const formCategory = ref('Деталь');
const formName = ref('');
const formBrand = ref('');
const formPartNumber = ref('');
const formStore = ref('autodoc.ru');
const formProductUrl = ref('');
const formQuantity = ref('1');
const formUnitPrice = ref('');
const formTotalPrice = ref('');
const formStatus = ref<PartStatus>('in_stock');
const formPurchaseDate = ref('');
const formInstalledMileage = ref('');

const isSubmitting = ref(false);

// Auto calc total price from qty * unitPrice if not manual
watch([formQuantity, formUnitPrice], ([q, u]) => {
  const qty = parseInputNumber(q) || 1;
  const unit = parseInputNumber(u);
  if (unit > 0) {
    formTotalPrice.value = String(Math.round(qty * unit));
  }
});

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return;
    if (props.partToEdit) {
      const p = props.partToEdit;
      formCategory.value = p.category;
      formName.value = p.name;
      formBrand.value = p.brand || '';
      formPartNumber.value = p.partNumber || '';
      formStore.value = p.store || '';
      formProductUrl.value = p.productUrl || '';
      formQuantity.value = String(p.quantity || 1);
      formUnitPrice.value = p.unitPrice ? String(p.unitPrice) : '';
      formTotalPrice.value = p.totalPrice ? String(p.totalPrice) : '';
      formStatus.value = p.status;
      formPurchaseDate.value = p.purchaseDate || '';
      formInstalledMileage.value = p.installedMileage ? String(p.installedMileage) : '';
    } else {
      formCategory.value = 'Фильтры и масла';
      formName.value = '';
      formBrand.value = '';
      formPartNumber.value = '';
      formStore.value = 'autodoc.ru';
      formProductUrl.value = '';
      formQuantity.value = '1';
      formUnitPrice.value = '';
      formTotalPrice.value = '';
      formStatus.value = props.defaultStatus || 'in_stock';
      formPurchaseDate.value = props.defaultPurchaseDate || new Date().toISOString().split('T')[0];
      formInstalledMileage.value = props.defaultStatus === 'installed' ? String(activeCar.value?.currentMileage || '') : '';
    }
  }
);

async function onSave() {
  const name = formName.value.trim();
  if (!name) return;

  isSubmitting.value = true;
  try {
    const qty = parseInputNumber(formQuantity.value) || 1;
    const total = formTotalPrice.value ? parseInputNumber(formTotalPrice.value) : null;
    const unit = formUnitPrice.value ? parseInputNumber(formUnitPrice.value) : (total ? Math.round(total / qty) : null);

    const savedPartId = await savePart({
      id: props.partToEdit?.id,
      category: formCategory.value,
      name,
      brand: formBrand.value.trim() || null,
      partNumber: formPartNumber.value.trim() || null,
      store: formStore.value.trim() || null,
      productUrl: formProductUrl.value.trim() || null,
      quantity: qty,
      unitPrice: unit,
      totalPrice: total,
      status: formStatus.value,
      purchaseDate: formPurchaseDate.value || null,
      installedMileage: formStatus.value === 'installed' && formInstalledMileage.value ? parseInputNumber(formInstalledMileage.value) : null,
      installedDate: formStatus.value === 'installed' ? (formPurchaseDate.value || new Date().toISOString().split('T')[0]) : null,
      serviceEventId: formStatus.value === 'installed' ? props.partToEdit?.serviceEventId || null : null
    });

    if (savedPartId) emit('saved', savedPartId);
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
      class="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="emit('close')"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Package class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              {{ partToEdit ? 'Редактировать деталь' : 'Новая деталь / расходник' }}
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
          <!-- Status selector -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Статус детали *
            </label>
            <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
              <button
                @click="formStatus = 'in_stock'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formStatus === 'in_stock' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                📦 На полке
              </button>
              <button
                @click="formStatus = 'installed'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formStatus === 'installed' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                🔩 Установлено
              </button>
              <button
                @click="formStatus = 'wishlist'"
                type="button"
                class="py-1.5 rounded-lg transition"
                :class="formStatus === 'wishlist' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
              >
                📝 Черновик
              </button>
            </div>
          </div>

          <!-- Category & Brand -->
          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Категория *
              </label>
              <select
                v-model="formCategory"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-amber-500"
              >
                <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Бренд / Производитель
              </label>
              <input
                v-model="formBrand"
                type="text"
                placeholder="MANN, Kayaba..."
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <!-- Name & Part Number -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Название детали *
            </label>
            <input
              v-model="formName"
              type="text"
              placeholder="Фильтр масляный, Амортизатор..."
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Артикул
              </label>
              <input
                v-model="formPartNumber"
                type="text"
                placeholder="W71275, 96879797"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Магазин
              </label>
              <input
                v-model="formStore"
                type="text"
                placeholder="autodoc.ru, OZON..."
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <!-- Product URL -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Ссылка на товар (маркетплейс)
            </label>
            <input
              v-model="formProductUrl"
              type="url"
              placeholder="https://www.autodoc.ru/part/..."
              class="w-full h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <!-- Quantity & Price (Only if not wishlist) -->
          <div v-if="formStatus !== 'wishlist'" class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Кол-во (шт)
              </label>
              <input
                v-model="formQuantity"
                type="number"
                min="1"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center font-bold text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Цена за ед. (₽)
              </label>
              <input
                v-model="formUnitPrice"
                type="text"
                inputmode="decimal"
                placeholder="282"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-bold text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Итого (₽) *
              </label>
              <input
                v-model="formTotalPrice"
                type="text"
                inputmode="decimal"
                placeholder="282"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-right font-black text-xs text-amber-600 dark:text-amber-400"
              />
            </div>
          </div>

          <!-- Installed Mileage if installed -->
          <div v-if="formStatus === 'installed'" class="grid grid-cols-2 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Пробег установки (км)
              </label>
              <input
                v-model="formInstalledMileage"
                type="text"
                inputmode="numeric"
                placeholder="139410"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-xs"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата покупки
              </label>
              <input
                v-model="formPurchaseDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>
          <div v-else-if="formStatus !== 'wishlist'">
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Дата покупки
            </label>
            <input
              v-model="formPurchaseDate"
              type="date"
              class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
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
            class="flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Сохранить деталь' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

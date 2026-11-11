<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  activeServiceEvents,
  activeTireSets,
  currentMileage,
  mountTireSet,
  saveTireSet,
  saveServiceEvent,
  saveMiscExpense,
  showToast
} from '../services/store';
import { parseInputNumber } from '../services/calculations';
import type { TireSeason, ServiceEvent, MiscExpense } from '../types';
import { Disc, X, Check, Plus } from 'lucide-vue-next';

const props = defineProps<{
  isOpen: boolean;
  serviceEventToEdit?: ServiceEvent | null;
  miscToEdit?: MiscExpense | null;
  initialTireSetId?: string;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();
const serviceCategory = ref<'tire' | 'wash' | 'detailing'>('tire');
const formDate = ref('');
const formMileage = ref('');
const formOrg = ref('Шиномонтаж');
const formAddress = ref('');
const formDescription = ref('Сезонный шиномонтаж и балансировка');
const formCost = ref('');
const isSeasonalTireSwap = ref(true);
const selectedTireSetId = ref('');
const showCreateNewTire = ref(false);
const newTireSeason = ref<TireSeason>('winter_spikes');
const newTireBrand = ref('');
const newTireDimension = ref('195/55 R15');
const newTireYear = ref(new Date().getFullYear());
const newTireCost = ref('');
const newTireProductUrl = ref('');
const isSubmitting = ref(false);

const nonArchivedTires = computed(() => activeTireSets.value.filter(tire => !tire.isArchived));
const organizationSuggestions = computed(() => [...new Set(activeServiceEvents.value.map(event => event.organization))]);

function autofillAddress() {
  const event = [...activeServiceEvents.value]
    .filter(item => item.organization.toLocaleLowerCase('ru-RU') === formOrg.value.trim().toLocaleLowerCase('ru-RU') && item.address)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (event?.address) formAddress.value = event.address;
}

function setCategoryDefaults(category: 'tire' | 'wash' | 'detailing') {
  if (category === 'tire') {
    formOrg.value = 'Шиномонтаж';
    formDescription.value = 'Сезонный шиномонтаж и балансировка';
  } else if (category === 'wash') {
    formOrg.value = 'Мойка';
    formDescription.value = 'Трёхфазная мойка + уборка салона';
  } else {
    formOrg.value = 'Детейлинг';
    formDescription.value = 'Полировка фар и кузова';
  }
  formAddress.value = '';
}

watch(serviceCategory, category => {
  if (!props.serviceEventToEdit && !props.miscToEdit) setCategoryDefaults(category);
});
watch(() => props.isOpen, open => {
  if (!open) return;
  const service = props.serviceEventToEdit;
  const misc = props.miscToEdit;
  showCreateNewTire.value = false;
  newTireBrand.value = '';
  newTireCost.value = '';
  newTireProductUrl.value = '';
  newTireSeason.value = 'winter_spikes';
  newTireDimension.value = '195/55 R15';
  newTireYear.value = new Date().getFullYear();

  if (misc) {
    serviceCategory.value = 'wash';
    formDate.value = misc.date;
    formMileage.value = misc.mileage ? String(misc.mileage) : String(currentMileage.value || '');
    formOrg.value = misc.organization || 'Мойка';
    formAddress.value = misc.address || '';
    formDescription.value = misc.name;
    formCost.value = String(misc.cost);
    isSeasonalTireSwap.value = false;
    selectedTireSetId.value = '';
    return;
  }

  if (service) {
    const description = service.items.map(item => item.name).join(', ');
    const isTire = service.items.some(item => /шиномонтаж|балансировка/i.test(item.name));
    serviceCategory.value = isTire ? 'tire' : 'detailing';
    formDate.value = service.date;
    formMileage.value = service.mileage !== null ? String(service.mileage) : '';
    formOrg.value = service.organization;
    formAddress.value = service.address || '';
    formDescription.value = description;
    formCost.value = String(service.totalLaborCost);
    isSeasonalTireSwap.value = isTire && Boolean(service.tireSetId);
    selectedTireSetId.value = service.tireSetId || activeTireSets.value.find(tire => tire.isMounted)?.id || '';
    return;
  }

  serviceCategory.value = 'tire';
  formDate.value = new Date().toISOString().split('T')[0];
  formMileage.value = String(currentMileage.value || '');
  formCost.value = '';
  formAddress.value = '';
  isSeasonalTireSwap.value = true;
  setCategoryDefaults('tire');
  const mounted = activeTireSets.value.find(tire => tire.isMounted && !tire.isArchived);
  selectedTireSetId.value = props.initialTireSetId
    || nonArchivedTires.value.find(tire => !tire.isMounted && (!mounted || tire.season !== mounted.season))?.id
    || nonArchivedTires.value.find(tire => !tire.isMounted)?.id
    || nonArchivedTires.value[0]?.id
    || '';
});

async function onSave() {
  const cost = parseInputNumber(formCost.value);
  const km = parseInputNumber(formMileage.value);
  if (!formDate.value || !formDescription.value.trim() || (isSeasonalTireSwap.value && serviceCategory.value === 'tire' && !showCreateNewTire.value && !selectedTireSetId.value)) {
    showToast('Заполните дату, описание и выберите комплект шин');
    return;
  }
  if (showCreateNewTire.value && !newTireBrand.value.trim()) {
    showToast('Укажите бренд и модель нового комплекта');
    return;
  }

  isSubmitting.value = true;
  try {
    const common = {
      date: formDate.value,
      mileage: km,
      organization: formOrg.value.trim() || 'Самостоятельно',
      address: formAddress.value.trim() || null
    };
    if (serviceCategory.value === 'wash') {
      await saveMiscExpense({
        id: props.miscToEdit?.id,
        ...common,
        name: formDescription.value.trim(),
        type: 'Мойка',
        cost
      });
    } else if (serviceCategory.value === 'tire' && isSeasonalTireSwap.value) {
      let targetTireId = selectedTireSetId.value;
      if (showCreateNewTire.value) {
        targetTireId = `tire-${Date.now()}`;
        await saveTireSet({
          id: targetTireId,
          name: newTireBrand.value.trim(),
          season: newTireSeason.value,
          dimension: newTireDimension.value.trim() || '195/55 R15',
          manufactureYear: newTireYear.value,
          purchasePrice: parseInputNumber(newTireCost.value),
          purchaseDate: formDate.value,
          productUrl: newTireProductUrl.value.trim() || null,
          isMounted: false,
          baseMileage: 0,
          mountedAtMileage: km
        });
      }
      await mountTireSet(targetTireId, km, true, cost, common.organization, {
        serviceEventId: props.serviceEventToEdit?.id,
        date: formDate.value,
        description: formDescription.value.trim(),
        address: common.address
      });
    } else {
      await saveServiceEvent({
        id: props.serviceEventToEdit?.id,
        ...common,
        totalLaborCost: cost,
        items: [{ id: props.serviceEventToEdit?.items[0]?.id || `work-${Date.now()}`, name: formDescription.value.trim(), cost }],
        attachedPartIds: props.serviceEventToEdit?.attachedPartIds || [],
        photoIds: props.serviceEventToEdit?.photoIds || [],
        tireSetId: null
      });
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
            <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Disc class="w-4 h-4" />
            </div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              Шиномонтаж, мойка, уход
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
          <!-- Category Tabs -->
          <div class="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
            <button
              @click="serviceCategory = 'tire'"
              type="button"
              class="py-2 rounded-lg transition"
              :class="serviceCategory === 'tire' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
            >
              🛞 Шиномонтаж
            </button>
            <button
              @click="serviceCategory = 'wash'"
              type="button"
              class="py-2 rounded-lg transition"
              :class="serviceCategory === 'wash' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
            >
              🚿 Мойка
            </button>
            <button
              @click="serviceCategory = 'detailing'"
              type="button"
              class="py-2 rounded-lg transition"
              :class="serviceCategory === 'detailing' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm' : 'text-slate-500'"
            >
              ✨ Детейлинг
            </button>
          </div>

          <!-- Common fields -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата *
              </label>
              <input
                v-model="formDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Пробег (км)
              </label>
              <input
                v-model="formMileage"
                type="text"
                inputmode="numeric"
                placeholder="203408"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Организация / Сервис
            </label>
            <input
              v-model="formOrg"
              @change="autofillAddress"
              list="misc-organizations"
              type="text"
              placeholder="Название сервиса или мойки"
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:ring-2 focus:ring-purple-500"
            />
            <datalist id="misc-organizations">
              <option v-for="org in organizationSuggestions" :key="org" :value="org" />
            </datalist>
            <input
              v-model="formAddress"
              type="text"
              placeholder="Адрес (подставится из прошлых записей)"
              class="w-full h-9 px-3 mt-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Описание работы
            </label>
            <input
              v-model="formDescription"
              type="text"
              placeholder="Сезонная смена резины, балансировка..."
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Стоимость (₽) *
            </label>
            <div class="relative">
              <input
                v-model="formCost"
                type="text"
                inputmode="decimal"
                placeholder="1800"
                class="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-base font-black focus:ring-2 focus:ring-purple-500"
              />
              <span class="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₽</span>
            </div>
          </div>

          <!-- SPECIAL TIRE SWAP BLOCK -->
          <div v-if="serviceCategory === 'tire'" class="p-3.5 rounded-2xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-3">
            <div class="flex items-center gap-2">
              <input
                v-model="isSeasonalTireSwap"
                id="seasonalSwapCheck"
                type="checkbox"
                class="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
              />
              <label for="seasonalSwapCheck" class="text-xs font-bold text-purple-900 dark:text-purple-200 cursor-pointer">
                🔄 Сезонная смена резины (переобувка)
              </label>
            </div>

            <div v-if="isSeasonalTireSwap" class="space-y-2">
              <label class="block text-[11px] font-semibold text-purple-800 dark:text-purple-300">
                Какой комплект устанавливаем на авто?
              </label>

              <select
                v-if="!showCreateNewTire"
                v-model="selectedTireSetId"
                class="w-full h-10 px-3 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option v-for="t in nonArchivedTires" :key="t.id" :value="t.id">
                  {{ t.season === 'summer' ? '☀️ Лето' : '❄️ Зима' }}: {{ t.name }} ({{ t.dimension }})
                  {{ t.isMounted ? '— сейчас на авто' : '— на хранении' }}
                </option>
              </select>

              <button
                @click="showCreateNewTire = !showCreateNewTire"
                type="button"
                class="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline flex items-center gap-1"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>{{ showCreateNewTire ? 'Выбрать из существующих шин' : '➕ Добавить и установить НОВЫЙ комплект резины' }}</span>
              </button>

              <!-- Inline New Tire Form -->
              <div v-if="showCreateNewTire" class="p-3 rounded-xl bg-white dark:bg-slate-800 border border-purple-200 dark:border-purple-700 space-y-2">
                <div class="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Параметры нового комплекта:
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <select
                    v-model="newTireSeason"
                    class="h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700"
                  >
                    <option value="summer">☀️ Летние</option>
                    <option value="winter_spikes">❄️ Зима шипы</option>
                    <option value="winter_friction">❄️ Зима липучка</option>
                  </select>
                  <input
                    v-model="newTireBrand"
                    type="text"
                    placeholder="Бренд и модель"
                    class="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700"
                  />
                </div>
                <div class="grid grid-cols-3 gap-2">
                  <input
                    v-model="newTireDimension"
                    type="text"
                    placeholder="195/55 R15"
                    class="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700"
                  />
                  <input
                    v-model="newTireYear"
                    type="number"
                    placeholder="Год (DOT)"
                    class="h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700"
                  />
                  <input
                    v-model="newTireCost"
                    type="text"
                    inputmode="decimal"
                    placeholder="Цена (₽)"
                    class="h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700 font-bold"
                  />
                </div>
                <input
                  v-model="newTireProductUrl"
                  type="url"
                  placeholder="Ссылка на магазин (необязательно)"
                  class="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-xs bg-slate-50 dark:bg-slate-700"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 mt-2">
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
            class="flex-1 h-11 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm flex items-center justify-center gap-1.5 transition active:scale-95 shadow-md shadow-purple-500/20"
          >
            <Check class="w-4 h-4" />
            <span>{{ isSubmitting ? 'Сохранение...' : 'Записать' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

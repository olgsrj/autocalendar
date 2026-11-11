<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue';
import {
  activeMaintenanceRules,
  activeParts,
  activeServiceEvents,
  currentMileage,
  isServiceModalOpen,
  editingServiceEvent,
  preselectedRuleForService,
  preselectedPartForService,
  saveServiceEvent,
  showToast
} from '../services/store';
import { db } from '../db';
import { parseInputNumber, formatCurrency } from '../services/calculations';
import type { Part, PhotoAttachment, ServiceWorkItem } from '../types';
import { Wrench, X, Check, Plus, Trash2, RotateCcw, Package, Sparkles, Camera, Search, ChevronDown } from 'lucide-vue-next';
import PartModal from './PartModal.vue';

const POPULAR_ORGS = ['Самостоятельно', 'Slok', 'GM Club', 'АП Сервис'];
const formDate = ref('');
const formMileage = ref('');
const formOrg = ref('Самостоятельно');
const formAddress = ref('');
const formOrderNumber = ref('');
const formNotes = ref('');
const formWorks = ref<ServiceWorkItem[]>([]);
const formTotalLaborCost = ref('');
const isCustomLaborCost = ref(false);
const selectedPartIds = ref<string[]>([]);
const isShelfPickerOpen = ref(false);
const shelfSearchQuery = ref('');
const isFullPartModalOpen = ref(false);
const existingPhotos = ref<PhotoAttachment[]>([]);
const newPhotos = ref<Array<{ id?: string; dataUrl: string }>>([]);
const photoInput = ref<HTMLInputElement | null>(null);
const workNameInputs = ref<Record<string, HTMLInputElement>>({});
const isSubmitting = ref(false);
const formError = ref('');

const calculatedWorksCost = computed(() => formWorks.value.reduce((sum, work) => sum + parseInputNumber(work.cost), 0));
watch(calculatedWorksCost, sum => {
  if (!isCustomLaborCost.value) formTotalLaborCost.value = String(sum);
});

const organizationSuggestions = computed(() => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const event of activeServiceEvents.value) {
    const key = event.organization.trim().toLocaleLowerCase('ru-RU');
    const current = counts.get(key);
    counts.set(key, { name: current?.name || event.organization.trim(), count: (current?.count || 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru')).map(item => item.name);
});

const workNameSuggestions = computed(() => [...new Set(activeServiceEvents.value.flatMap(event => event.items.map(item => item.name.trim()).filter(Boolean)))]
  .sort((a, b) => a.localeCompare(b, 'ru')));

const availablePartsOnShelf = computed(() => activeParts.value.filter(part =>
  part.status === 'in_stock' || selectedPartIds.value.includes(part.id)
));

const filteredPartsOnShelf = computed(() => {
  const query = shelfSearchQuery.value.trim().toLocaleLowerCase('ru-RU');
  if (!query) return availablePartsOnShelf.value;
  return availablePartsOnShelf.value.filter(part =>
    [part.name, part.category, part.brand, part.partNumber, part.store]
      .some(value => value?.toLocaleLowerCase('ru-RU').includes(query))
  );
});

const selectedParts = computed(() => selectedPartIds.value
  .map(id => activeParts.value.find(part => part.id === id))
  .filter((part): part is Part => Boolean(part)));

function removeSelectedPart(partId: string) {
  selectedPartIds.value = selectedPartIds.value.filter(id => id !== partId);
}

function onFullPartSaved(partId: string) {
  if (!selectedPartIds.value.includes(partId)) selectedPartIds.value.push(partId);
}

function onTotalLaborCostInput() {
  isCustomLaborCost.value = true;
}

function resetToAutoLaborCost() {
  isCustomLaborCost.value = false;
  formTotalLaborCost.value = String(calculatedWorksCost.value);
}

function autofillAddress(org: string) {
  if (org.trim().toLocaleLowerCase('ru-RU') === 'самостоятельно') {
    formAddress.value = '';
    return;
  }
  const past = [...activeServiceEvents.value]
    .filter(event => event.organization.trim().toLocaleLowerCase('ru-RU') === org.trim().toLocaleLowerCase('ru-RU') && event.address)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (past?.address) formAddress.value = past.address;
}

function selectOrg(org: string) {
  formOrg.value = org;
  autofillAddress(org);
}

function onOrgInput() {
  if (organizationSuggestions.value.some(org => org.toLocaleLowerCase('ru-RU') === formOrg.value.trim().toLocaleLowerCase('ru-RU'))) {
    autofillAddress(formOrg.value);
  }
}

function setWorkNameInput(el: Element | null, id: string) {
  if (el instanceof HTMLInputElement) workNameInputs.value[id] = el;
}

async function addWorkItem(name = '', cost = 0, ruleId: string | null = null) {
  const id = `work-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  formWorks.value.push({ id, name, cost, maintenanceRuleId: ruleId });
  await nextTick();
  workNameInputs.value[id]?.focus();
}

function removeWorkItem(index: number) {
  formWorks.value.splice(index, 1);
}

async function compressPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = dataUrl;
  });
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.78);
}

async function onPhotosSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  try {
    for (const file of Array.from(input.files || [])) {
      newPhotos.value.push({ dataUrl: await compressPhoto(file) });
    }
  } catch {
    showToast('Не удалось обработать одну из фотографий');
  } finally {
    input.value = '';
  }
}

watch(() => isServiceModalOpen.value, async open => {
  if (!open) return;
  existingPhotos.value = [];
  newPhotos.value = [];
  isShelfPickerOpen.value = false;
  shelfSearchQuery.value = '';
  isFullPartModalOpen.value = false;
  workNameInputs.value = {};

  if (editingServiceEvent.value) {
    const service = editingServiceEvent.value;
    formDate.value = service.date;
    formMileage.value = service.mileage !== null ? String(service.mileage) : '';
    formOrg.value = service.organization;
    formAddress.value = service.address || '';
    formOrderNumber.value = service.orderNumber || '';
    formNotes.value = service.notes || '';
    formWorks.value = service.items.map(item => ({ ...item }));
    formTotalLaborCost.value = String(service.totalLaborCost);
    isCustomLaborCost.value = service.isCustomTotalLaborCost || false;
    selectedPartIds.value = [...service.attachedPartIds];
    existingPhotos.value = await db.photos.where('entityId').equals(service.id).toArray();
  } else {
    formDate.value = new Date().toISOString().split('T')[0];
    formMileage.value = String(currentMileage.value || '');
    formOrg.value = 'Самостоятельно';
    formAddress.value = '';
    formOrderNumber.value = '';
    formNotes.value = '';
    selectedPartIds.value = preselectedPartForService.value ? [preselectedPartForService.value] : [];
    preselectedPartForService.value = null;
    isCustomLaborCost.value = false;
    const rule = preselectedRuleForService.value;
    formWorks.value = [{
      id: `work-${Date.now()}`,
      name: rule ? `Замена: ${rule.name}` : '',
      cost: 0,
      maintenanceRuleId: rule?.id || null
    }];
    formTotalLaborCost.value = '0';
  }
});

async function onSave() {
  formError.value = '';
  if (!formDate.value || formWorks.value.length === 0 || !formWorks.value.some(work => work.name.trim())) {
    formError.value = 'Укажите дату и хотя бы одну работу';
    showToast(formError.value);
    return;
  }
  isSubmitting.value = true;
  try {
    await saveServiceEvent({
      id: editingServiceEvent.value?.id,
      date: formDate.value,
      mileage: formMileage.value ? parseInputNumber(formMileage.value) : null,
      organization: formOrg.value.trim() || 'Самостоятельно',
      address: formOrg.value !== 'Самостоятельно' ? formAddress.value.trim() || null : null,
      orderNumber: formOrderNumber.value.trim() || null,
      items: formWorks.value.filter(work => work.name.trim()).map(work => ({
        ...work,
        name: work.name.trim(),
        cost: parseInputNumber(work.cost)
      })),
      totalLaborCost: parseInputNumber(formTotalLaborCost.value),
      isCustomTotalLaborCost: isCustomLaborCost.value,
      attachedPartIds: selectedPartIds.value,
      photoIds: existingPhotos.value.map(photo => photo.id),
      tireSetId: editingServiceEvent.value?.tireSetId || null,
      notes: formNotes.value.trim() || null
    }, newPhotos.value);
    preselectedRuleForService.value = null;
    preselectedPartForService.value = null;
    isServiceModalOpen.value = false;
  } catch (error) {
    console.error('Failed to save service event:', error);
    formError.value = `Не удалось сохранить: ${error instanceof Error ? error.message : 'ошибка базы данных'}`;
    showToast(formError.value, 5000);
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
      v-if="isServiceModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      @click.self="isServiceModalOpen = false"
    >
      <div
        class="bg-white dark:bg-slate-900 w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col animate-in slide-in-from-bottom duration-200"
      >
        <!-- Modal Header -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Wrench class="w-4 h-4" />
            </div>
            <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
              {{ editingServiceEvent ? 'Редактировать заказ-наряд' : 'Новый заказ-наряд / ТО' }}
            </h3>
          </div>
          <button
            @click="isServiceModalOpen = false"
            class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- Form Body -->
        <div class="space-y-4 overflow-y-auto flex-1 pr-1 py-1">
          <!-- Step 1: Organization & Address -->
          <div class="space-y-2">
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400">
              Организация / Сервис *
            </label>
            <div class="flex flex-wrap gap-1.5 mb-1.5">
              <button
                v-for="org in POPULAR_ORGS"
                :key="org"
                @click="selectOrg(org)"
                type="button"
                class="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                :class="formOrg === org
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'"
              >
                {{ org === 'Самостоятельно' ? '🛠️ Самостоятельно' : org }}
              </button>
            </div>
            <input
              v-model="formOrg"
              @input="onOrgInput"
              list="service-organizations"
              type="text"
              placeholder="Название автосервиса или СТО"
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <datalist id="service-organizations">
              <option v-for="org in organizationSuggestions" :key="org" :value="org" />
            </datalist>

            <!-- Address (autofills if known org) -->
            <div v-if="formOrg !== 'Самостоятельно'">
              <label class="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1 mt-1.5">
                Адрес сервиса (автоподстановка)
              </label>
              <input
                v-model="formAddress"
                type="text"
                placeholder="г. Москва, ул. ..."
                class="w-full h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <!-- Step 2: Mileage & Date & Order # -->
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Пробег (км)
              </label>
              <input
                v-model="formMileage"
                type="text"
                inputmode="numeric"
                placeholder="203408"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Дата *
              </label>
              <input
                v-model="formDate"
                type="date"
                class="w-full h-10 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div class="col-span-2 sm:col-span-1">
              <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                № Заказ-наряда
              </label>
              <input
                v-model="formOrderNumber"
                type="text"
                placeholder="ЗН-1234"
                class="w-full h-10 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <!-- Step 3: Dynamic Works List -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>Список работ</span>
                <span class="text-xs text-slate-400 font-normal">({{ formWorks.length }})</span>
              </label>
              <button
                @click="addWorkItem()"
                type="button"
                class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1"
              >
                <Plus class="w-3.5 h-3.5" />
                <span>Добавить работу</span>
              </button>
            </div>

            <div class="space-y-2">
              <div
                v-for="(w, idx) in formWorks"
                :key="w.id"
                class="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 space-y-2"
              >
                <div class="flex items-center gap-2">
                  <input
                    :ref="el => setWorkNameInput(el as Element | null, w.id)"
                    v-model="w.name"
                    list="service-work-names"
                    type="text"
                    placeholder="Название работы (напр., Замена моторного масла)"
                    class="flex-1 h-9 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div class="relative w-28">
                    <input
                      v-model="w.cost"
                      type="text"
                      inputmode="decimal"
                      placeholder="0"
                      class="w-full h-9 pl-2.5 pr-6 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">₽</span>
                  </div>
                  <button
                    v-if="formWorks.length > 1"
                    @click="removeWorkItem(idx)"
                    type="button"
                    class="w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 flex items-center justify-center transition"
                  >
                    <Trash2 class="w-4 h-4" />
                  </button>
                </div>

                <!-- Link to Maintenance Rule -->
                <div class="flex items-center gap-1.5">
                  <span class="text-[10px] text-slate-400 shrink-0">🔄 Регламент:</span>
                  <select
                    v-model="w.maintenanceRuleId"
                    class="flex-1 h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option :value="null">Без привязки к ТО</option>
                    <option
                      v-for="rule in activeMaintenanceRules"
                      :key="rule.id"
                      :value="rule.id"
                    >
                      ТО: {{ rule.name }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
            <datalist id="service-work-names">
              <option v-for="name in workNameSuggestions" :key="name" :value="name" />
            </datalist>
            <button
              @click="addWorkItem()"
              type="button"
              class="w-full mt-2 h-10 rounded-xl border border-dashed border-emerald-400 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              <Plus class="w-4 h-4" />
              Добавить ещё работу
            </button>
          </div>

          <!-- Step 4: Attached Parts from Shelf -->
          <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Package class="w-4 h-4 text-amber-500" />
                <span>Использованные запчасти со склада</span>
              </div>
              <button
                @click="isFullPartModalOpen = true"
                type="button"
                class="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                + Деталь в чек
              </button>
            </div>

            <div v-if="selectedParts.length > 0" class="mb-3 space-y-1.5">
              <div class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Выбрано деталей: {{ selectedParts.length }}
              </div>
              <div
                v-for="part in selectedParts"
                :key="part.id"
                class="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-800 border border-emerald-200 dark:border-emerald-900"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{{ part.name }}</div>
                  <div class="truncate text-[10px] text-slate-400">{{ part.category }}</div>
                </div>
                <span class="font-mono text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  {{ formatCurrency(part.totalPrice) }}
                </span>
                <button
                  @click="removeSelectedPart(part.id)"
                  type="button"
                  title="Убрать из заказ-наряда"
                  class="w-7 h-7 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center justify-center shrink-0"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <button
              @click="isShelfPickerOpen = !isShelfPickerOpen"
              type="button"
              :aria-expanded="isShelfPickerOpen"
              class="w-full h-10 px-3 rounded-xl border border-dashed border-amber-400 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition"
            >
              <Plus v-if="!isShelfPickerOpen" class="w-4 h-4" />
              <span>{{ isShelfPickerOpen ? 'Скрыть список полки' : 'Добавить деталь с полки' }}</span>
              <span class="font-normal text-amber-500">({{ availablePartsOnShelf.length }})</span>
              <ChevronDown class="w-4 h-4 transition-transform" :class="{ 'rotate-180': isShelfPickerOpen }" />
            </button>

            <div v-if="isShelfPickerOpen" class="mt-2.5">
              <div class="relative mb-2">
                <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  v-model="shelfSearchQuery"
                  type="search"
                  placeholder="Поиск по названию, артикулу, бренду..."
                  class="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  v-if="shelfSearchQuery"
                  @click="shelfSearchQuery = ''"
                  type="button"
                  title="Очистить поиск"
                  class="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center"
                >
                  <X class="w-3.5 h-3.5" />
                </button>
              </div>

              <div v-if="filteredPartsOnShelf.length > 0" class="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                <label
                  v-for="part in filteredPartsOnShelf"
                  :key="part.id"
                  class="flex items-center gap-2 p-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 cursor-pointer text-xs transition"
                >
                  <input
                    v-model="selectedPartIds"
                    :value="part.id"
                    type="checkbox"
                    class="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-semibold text-slate-800 dark:text-slate-200">{{ part.name }}</span>
                    <span class="block truncate text-[10px] text-slate-400">
                      {{ part.category }}<template v-if="part.partNumber"> • {{ part.partNumber }}</template>
                    </span>
                  </span>
                  <span class="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {{ formatCurrency(part.totalPrice) }}
                  </span>
                </label>
              </div>
              <div v-else class="p-3 text-center text-xs text-slate-400 italic">
                {{ availablePartsOnShelf.length > 0 ? 'По вашему запросу ничего не найдено' : 'На полке нет свободных купленных деталей' }}
              </div>
            </div>
          </div>

          <!-- Step 5: Total Labor Cost (Auto vs Manual) -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Общая стоимость работ (₽) *
              </label>
              <button
                v-if="isCustomLaborCost"
                @click="resetToAutoLaborCost"
                type="button"
                class="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-medium"
              >
                <RotateCcw class="w-3 h-3" />
                <span>↺ Рассчитать по пунктам</span>
              </button>
              <span v-else class="text-[10px] text-slate-400 font-medium">
                🔓 Сумма по пунктам
              </span>
            </div>
            <div class="relative">
              <input
                v-model="formTotalLaborCost"
                @input="onTotalLaborCostInput"
                type="text"
                inputmode="decimal"
                placeholder="0"
                class="w-full h-12 px-4 rounded-xl border text-lg font-black focus:outline-none focus:ring-2 focus:ring-emerald-500"
                :class="isCustomLaborCost
                  ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100'"
              />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                ₽
              </span>
            </div>

            <!-- Discrepancy indicator if custom total -->
            <div
              v-if="isCustomLaborCost && (parseInputNumber(formTotalLaborCost) !== calculatedWorksCost)"
              class="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1"
            >
              <Sparkles class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>
                Сумма по пунктам: {{ formatCurrency(calculatedWorksCost) }} •
                Разница: {{ formatCurrency(parseInputNumber(formTotalLaborCost) - calculatedWorksCost) }}
              </span>
            </div>
          </div>

          <div>
            <input ref="photoInput" type="file" accept="image/*" multiple class="hidden" @change="onPhotosSelected" />
            <button
              @click="photoInput?.click()"
              type="button"
              class="w-full h-11 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Camera class="w-4 h-4" />
              Прикрепить фото (Заказ-наряд / Чек / Ремонт)
            </button>
            <div v-if="existingPhotos.length || newPhotos.length" class="flex gap-2 overflow-x-auto mt-2 pb-1">
              <div v-for="photo in existingPhotos" :key="photo.id" class="relative shrink-0">
                <img :src="photo.dataUrl" alt="Вложение заказ-наряда" class="w-24 h-24 object-cover rounded-xl bg-slate-100 dark:bg-slate-800" />
                <button
                  @click="existingPhotos = existingPhotos.filter(item => item.id !== photo.id)"
                  type="button"
                  title="Удалить фото"
                  class="absolute top-1 right-1 w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center"
                ><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
              <div v-for="(photo, index) in newPhotos" :key="index" class="relative shrink-0">
                <img :src="photo.dataUrl" alt="Новое вложение" class="w-24 h-24 object-cover rounded-xl bg-slate-100 dark:bg-slate-800" />
                <button
                  @click="newPhotos.splice(index, 1)"
                  type="button"
                  title="Удалить фото"
                  class="absolute top-1 right-1 w-6 h-6 rounded-lg bg-red-600 text-white flex items-center justify-center"
                ><Trash2 class="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>

          <!-- Notes -->
          <div>
            <label class="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Заметки о визите / мастере
            </label>
            <input
              v-model="formNotes"
              type="text"
              placeholder="Мастер Иванов, гарантия 6 мес..."
              class="w-full h-10 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        <!-- Actions -->
        <div v-if="formError" class="mt-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-xs">{{ formError }}</div>
        <div class="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 mt-2">
          <button
            @click="isServiceModalOpen = false"
            type="button"
            class="flex-1 h-12 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Отмена
          </button>
          <button
            @click="onSave"
            :disabled="isSubmitting"
            type="button"
            class="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-emerald-500/25 disabled:opacity-50"
          >
            <Check class="w-4 h-4 stroke-[2.5]" />
            <span>{{ isSubmitting ? 'Сохранение...' : '💾 Сохранить заказ-наряд' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <PartModal
    :is-open="isFullPartModalOpen"
    :part-to-edit="null"
    default-status="in_stock"
    :default-purchase-date="formDate"
    @saved="onFullPartSaved"
    @close="isFullPartModalOpen = false"
  />
</template>

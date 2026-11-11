<script setup lang="ts">
import { ref, shallowRef, computed, onMounted } from 'vue';
import JSZip from 'jszip';
import { db } from '../db';
import {
  cars,
  activeCarId,
  refuelings,
  serviceEvents,
  parts,
  tireSets,
  appSettings,
  setActiveCar,
  setTheme,
  updateAppSettings,
  exportBackupJson,
  exportBackupZip,
  shareBackupFile,
  clearAllDatabaseAndReset,
  deleteCar,
  loadAllData,
  showToast,
  navigateBack,
  isCarModalOpen,
  editingCar,
  isSellCarModalOpen
} from '../services/store';
import {
  formatKm,
  formatCurrency,
  formatDateRu,
  parseInputNumber
} from '../services/calculations';
import type { Car, BackupData } from '../types';
import {
  ArrowLeft,
  Car as CarIcon,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Sun,
  Moon,
  Smartphone,
  Eye,
  EyeOff,
  Download,
  Upload,
  Share2,
  Shield,
  Bell,
  Archive,
  Check,
  AlertTriangle,
  RotateCcw,
  FileArchive,
  Database,
  X
} from 'lucide-vue-next';

// 1. Garage Management
const activeCars = computed(() => cars.value.filter(c => c.status === 'active'));
const soldCars = computed(() => cars.value.filter(c => c.status === 'sold'));

function onSelectCar(carId: string) {
  setActiveCar(carId);
  showToast('Активный автомобиль переключен');
}

function openAddCar() {
  editingCar.value = null;
  isCarModalOpen.value = true;
}

function openEditCar(car: Car) {
  editingCar.value = car;
  isCarModalOpen.value = true;
}

function openSellCar(car: Car) {
  editingCar.value = car;
  isSellCarModalOpen.value = true;
}

const carToDelete = ref<Car | null>(null);
const isDeleteCarConfirmOpen = ref(false);

function promptDeleteCar(car: Car) {
  carToDelete.value = car;
  isDeleteCarConfirmOpen.value = true;
}

async function confirmDeleteCar() {
  if (carToDelete.value) {
    await deleteCar(carToDelete.value.id);
    isDeleteCarConfirmOpen.value = false;
    carToDelete.value = null;
  }
}

// 2. Theme & Thresholds & Salary
const showSalary = ref(false);
const salaryInput = ref<string | number>(appSettings.value.monthlySalaryNet || 130000);
const remindKmInput = ref<string | number>(appSettings.value.maintenanceRemindKm || 1000);
const remindDaysInput = ref<string | number>(appSettings.value.maintenanceRemindDays || 30);
const tireAgeInput = ref<string | number>(appSettings.value.tireMaxAgeYears || 6);

async function onSaveThresholds() {
  await updateAppSettings({
    maintenanceRemindKm: parseInputNumber(remindKmInput.value) || 1000,
    maintenanceRemindDays: parseInputNumber(remindDaysInput.value) || 30,
    tireMaxAgeYears: parseInputNumber(tireAgeInput.value) || 6,
    monthlySalaryNet: parseInputNumber(salaryInput.value) || 130000
  });
}

// 3. Backup & Storage info
const isStoragePersisted = ref<boolean | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isImportPreviewOpen = ref(false);
const pendingImportData = shallowRef<BackupData | null>(null);
const importFileSummary = ref<{
  carsCount: number;
  refuelsCount: number;
  servicesCount: number;
  partsCount: number;
  tiresCount: number;
  carName: string;
} | null>(null);

const isClearDbConfirmOpen = ref(false);
const clearDbStep = ref<1 | 2>(1);
const clearDbConfirmation = ref('');
const photosCount = ref(0);
const storageUsageBytes = ref<number | null>(null);

async function updateStorageInfo() {
  photosCount.value = await db.photos.count();
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    storageUsageBytes.value = estimate.usage ?? 0;
  }
}

function formatStorageSize(bytes: number | null): string {
  if (bytes === null) return 'Недоступно';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function openClearDbConfirmation() {
  clearDbStep.value = 1;
  clearDbConfirmation.value = '';
  isClearDbConfirmOpen.value = true;
}

async function confirmClearDatabase() {
  if (clearDbConfirmation.value !== 'УДАЛИТЬ') return;
  await clearAllDatabaseAndReset();
  await updateStorageInfo();
  isClearDbConfirmOpen.value = false;
}

onMounted(async () => {
  await updateStorageInfo();
  if (navigator.storage && navigator.storage.persisted) {
    try {
      isStoragePersisted.value = await navigator.storage.persisted();
    } catch {
      isStoragePersisted.value = null;
    }
  }
});

const isBackupOverdue = computed(() => {
  if (!appSettings.value.lastBackupDate) return true;
  const last = new Date(appSettings.value.lastBackupDate).getTime();
  const diffDays = (Date.now() - last) / (1000 * 3600 * 24);
  return diffDays > 30;
});

function triggerFileInput() {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
}

async function onFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    let data: BackupData;

    if (file.name.endsWith('.zip')) {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const backupJsonFile = contents.file('backup.json');
      if (!backupJsonFile) {
        showToast('Файл backup.json не найден внутри архива');
        return;
      }
      const jsonText = await backupJsonFile.async('text');
      data = JSON.parse(jsonText);
    } else {
      const text = await file.text();
      data = JSON.parse(text);
    }

    if (!data.cars || !Array.isArray(data.cars)) {
      showToast('Некорректная структура файла бэкапа');
      return;
    }

    pendingImportData.value = data;
    importFileSummary.value = {
      carsCount: data.cars.length,
      refuelsCount: data.refuelings?.length || 0,
      servicesCount: data.serviceEvents?.length || 0,
      partsCount: data.parts?.length || 0,
      tiresCount: data.tireSets?.length || 0,
      carName: data.cars[0]?.name || 'Автомобиль'
    };
    isImportPreviewOpen.value = true;
  } catch (err) {
    console.error('Import parse error:', err);
    showToast('Ошибка чтения файла бэкапа');
  }
}

async function executeImport(mode: 'replace' | 'merge') {
  if (!pendingImportData.value) return;

  try {
    await db.importBackup(pendingImportData.value, mode);
    await loadAllData();
    await updateStorageInfo();
    isImportPreviewOpen.value = false;
    pendingImportData.value = null;
    showToast(mode === 'replace' ? 'База данных полностью восстановлена!' : 'Данные успешно объединены!');
  } catch (err) {
    console.error('Failed to execute import:', err);
    showToast('Ошибка при сохранении данных в IndexedDB');
  }
}

// 4. Notifications
const notificationPermission = ref<NotificationPermission | 'unknown'>(
  typeof Notification !== 'undefined' ? Notification.permission : 'unknown'
);

async function requestNotificationPermission() {
  if (typeof Notification === 'undefined') {
    showToast('Уведомления не поддерживаются вашим браузером');
    return;
  }
  try {
    const res = await Notification.requestPermission();
    notificationPermission.value = res;
    if (res === 'granted') {
      showToast('Уведомления включены!');
    } else {
      showToast('Уведомления отклонены в настройках браузера');
    }
  } catch (err) {
    console.error('Notification error:', err);
  }
}
</script>

<template>
  <div class="space-y-6 pb-8">
    <!-- Top Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          @click="navigateBack"
          type="button"
          class="w-9 h-9 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
          title="Вернуться на Главную"
        >
          <ArrowLeft class="w-5 h-5" />
        </button>
        <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Настройки и Гараж
        </h2>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- BLOCK 1: My Garage (Cars Management)       -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <CarIcon class="w-4 h-4" />
          </div>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
              Мой гараж
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Текущие и прошлые автомобили
            </p>
          </div>
        </div>

        <button
          @click="openAddCar"
          type="button"
          class="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center gap-1.5 transition active:scale-95"
        >
          <Plus class="w-3.5 h-3.5" />
          <span>Добавить</span>
        </button>
      </div>

      <!-- Active Cars List -->
      <div class="space-y-3">
        <div
          v-for="car in activeCars"
          :key="car.id"
          class="p-4 rounded-2xl border transition-all"
          :class="car.id === activeCarId
            ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 ring-2 ring-emerald-500/20'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0 cursor-pointer" @click="onSelectCar(car.id)">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <h4 class="font-black text-slate-900 dark:text-slate-100 text-base truncate">
                  {{ car.name }}
                  <span v-if="car.year" class="font-normal text-slate-500 text-sm">({{ car.year }})</span>
                </h4>
                <span
                  v-if="car.id === activeCarId"
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center gap-1"
                >
                  <Check class="w-3 h-3 stroke-[3]" />
                  Выбран сейчас
                </span>
              </div>

              <!-- Badges & info -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span v-if="car.plateNumber" class="font-mono font-bold uppercase text-slate-700 dark:text-slate-300">
                  {{ car.plateNumber }}
                </span>
                <span v-if="car.defaultFuelType" class="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {{ car.defaultFuelType }}
                </span>
                <span>
                  {{ formatKm(car.purchaseMileage) }} → <b class="text-slate-900 dark:text-slate-100 font-mono">{{ formatKm(car.currentMileage) }}</b>
                </span>
              </div>

              <div class="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                Куплен: {{ formatDateRu(car.purchaseDate) }} • Покупка: {{ formatCurrency(car.purchasePrice) }}
                <span v-if="car.selectionServiceCost || (car.extraPurchaseCosts && car.extraPurchaseCosts.length > 0)">
                  (+{{ formatCurrency((car.selectionServiceCost || 0) + (car.extraPurchaseCosts || []).reduce((a, c) => a + c.cost, 0)) }} допы)
                </span>
              </div>
            </div>
          </div>

          <!-- Car Actions Row -->
          <div class="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
            <button
              v-if="car.id !== activeCarId"
              @click="onSelectCar(car.id)"
              type="button"
              class="px-2.5 py-1 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
            >
              Выбрать авто
            </button>
            <div v-else class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Основной для просмотра
            </div>

            <div class="flex items-center gap-1">
              <button
                @click="openEditCar(car)"
                type="button"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Редактировать параметры"
              >
                <Edit2 class="w-4 h-4" />
              </button>

              <button
                @click="openSellCar(car)"
                type="button"
                class="px-2 py-1 rounded-lg text-xs font-semibold text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition flex items-center gap-1"
                title="Пометить проданным"
              >
                <Tag class="w-3.5 h-3.5" />
                <span>Продать</span>
              </button>

              <button
                v-if="cars.length > 1"
                @click="promptDeleteCar(car)"
                type="button"
                class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                title="Удалить автомобиль"
              >
                <Trash2 class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Sold / Archived Cars List -->
      <div v-if="soldCars.length > 0" class="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
        <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Archive class="w-3.5 h-3.5" />
          <span>Архив (Проданные авто)</span>
        </h4>

        <div class="space-y-3">
          <div
            v-for="car in soldCars"
            :key="car.id"
            class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 opacity-75 hover:opacity-100 transition"
          >
            <div class="flex items-start justify-between gap-3 cursor-pointer" @click="onSelectCar(car.id)">
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {{ car.name }}
                  </h4>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400">
                    Продано
                  </span>
                </div>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  Итоговый пробег: {{ formatKm(car.soldMileage || car.currentMileage) }}
                  <span v-if="car.soldDate"> • {{ formatDateRu(car.soldDate) }}</span>
                  <span v-if="car.soldPrice"> • Продан за {{ formatCurrency(car.soldPrice) }}</span>
                </div>
              </div>
            </div>

            <div class="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <button
                @click="onSelectCar(car.id)"
                type="button"
                class="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {{ car.id === activeCarId ? '✓ Сейчас активен в приложении' : 'Открыть историю' }}
              </button>

              <div class="flex items-center gap-1">
                <button
                  @click="openSellCar(car)"
                  type="button"
                  class="px-2 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition flex items-center gap-1"
                  title="Вернуть из архива"
                >
                  <RotateCcw class="w-3.5 h-3.5" />
                  <span>Вернуть</span>
                </button>
                <button
                  @click="openEditCar(car)"
                  type="button"
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Edit2 class="w-3.5 h-3.5" />
                </button>
                <button
                  @click="promptDeleteCar(car)"
                  type="button"
                  class="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- BLOCK 2: App Theme & Thresholds & Salary   -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors space-y-5">
      <div>
        <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
          Оформление и Параметры расчётов
        </h3>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Тема приложения, пороги ТО и личный доход
        </p>
      </div>

      <!-- 1. Theme switcher -->
      <div class="space-y-1.5">
        <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
          Тема приложения
        </label>
        <div class="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl">
          <button
            @click="setTheme('light')"
            type="button"
            class="py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            :class="appSettings.theme === 'light'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'"
          >
            <Sun class="w-4 h-4 text-amber-500" />
            <span>Светлая</span>
          </button>

          <button
            @click="setTheme('dark')"
            type="button"
            class="py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            :class="appSettings.theme === 'dark'
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'"
          >
            <Moon class="w-4 h-4 text-blue-400" />
            <span>Тёмная</span>
          </button>

          <button
            @click="setTheme('system')"
            type="button"
            class="py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
            :class="appSettings.theme === 'system'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'"
          >
            <Smartphone class="w-4 h-4 text-emerald-500" />
            <span>Система</span>
          </button>
        </div>
      </div>

      <!-- 2. Alert Thresholds -->
      <div class="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
        <label class="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          Пороги предупреждений («Требует внимания»)
        </label>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <span class="text-[11px] text-slate-500">Предупреждать о ТО за (км)</span>
            <input
              v-model="remindKmInput"
              @change="onSaveThresholds"
              type="text"
              inputmode="decimal"
              class="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="space-y-1">
            <span class="text-[11px] text-slate-500">Предупреждать о ТО за (дней)</span>
            <input
              v-model="remindDaysInput"
              @change="onSaveThresholds"
              type="text"
              inputmode="decimal"
              class="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="space-y-1">
          <span class="text-[11px] text-slate-500">Срок службы шин с года выпуска (лет)</span>
          <input
            v-model="tireAgeInput"
            @change="onSaveThresholds"
            type="number"
            class="w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <!-- 3. Financial parameter: Monthly salary -->
      <div class="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold text-slate-700 dark:text-slate-300">
            Среднемесячный доход (чистый, на руки)
          </label>
          <button
            @click="showSalary = !showSalary"
            type="button"
            class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1"
          >
            <component :is="showSalary ? EyeOff : Eye" class="w-3.5 h-3.5" />
            <span>{{ showSalary ? 'Скрыть' : 'Показать' }}</span>
          </button>
        </div>

        <div class="relative">
          <input
            v-if="showSalary"
            v-model="salaryInput"
            @change="onSaveThresholds"
            type="text"
            inputmode="decimal"
            placeholder="130 000"
            class="w-full h-11 px-3.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            v-else
            type="password"
            readonly
            :value="'••••••••'"
            @click="showSalary = true"
            class="w-full h-11 px-3.5 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-sm font-semibold font-mono tracking-widest text-slate-900 dark:text-slate-100 cursor-pointer"
          />
          <span class="absolute right-3.5 top-3 text-xs text-slate-400 font-mono">₽</span>
        </div>
        <p class="text-[11px] text-slate-400">
          Используется на Главной для расчёта доли расходов на содержание в % от зарплаты.
        </p>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- BLOCK 3: Backup & Data Transfer            -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors space-y-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <Database class="w-4 h-4" />
        </div>
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Бэкап и Перенос данных
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Локальная база IndexedDB в памяти устройства
          </p>
        </div>
      </div>

      <!-- State of Local DB Badge -->
      <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-600 dark:text-slate-300">
          <div>Автомобилей: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ cars.length }}</b></div>
          <div>Заправок: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ refuelings.length }}</b></div>
          <div>Заказ-нарядов: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ serviceEvents.length }}</b></div>
          <div>Запчастей: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ parts.length }}</b></div>
          <div>Шин: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ tireSets.length }}</b></div>
          <div>Фотографий: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ photosCount }}</b></div>
          <div>Занято браузером: <b class="text-slate-900 dark:text-slate-100 font-mono">{{ formatStorageSize(storageUsageBytes) }}</b></div>
        </div>

        <div class="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">
            Последний бэкап:
            <b class="text-slate-700 dark:text-slate-300">
              {{ appSettings.lastBackupDate ? formatDateRu(appSettings.lastBackupDate.substring(0, 10)) : 'Ещё не делался' }}
            </b>
          </span>
          <span v-if="isBackupOverdue" class="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
            <AlertTriangle class="w-3 h-3" />
            Рекомендуем бэкап
          </span>
        </div>
      </div>

      <!-- Export Buttons -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          @click="exportBackupJson"
          type="button"
          class="h-11 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm shadow-blue-500/20 transition active:scale-95"
        >
          <Download class="w-4 h-4" />
          <span>Скачать .json бэкап</span>
        </button>

        <button
          @click="exportBackupZip"
          type="button"
          class="h-11 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
        >
          <FileArchive class="w-4 h-4 text-amber-500" />
          <span>Скачать архив .zip (с фото)</span>
        </button>
      </div>

      <!-- Share Button -->
      <button
        @click="shareBackupFile"
        type="button"
        class="w-full h-11 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
      >
        <Share2 class="w-4 h-4" />
        <span>Поделиться бэкапом (Telegram / Диск)</span>
      </button>

      <!-- Import Button -->
      <div class="pt-2">
        <input
          ref="fileInputRef"
          type="file"
          accept=".json,.zip"
          class="hidden"
          @change="onFileSelected"
        />
        <button
          @click="triggerFileInput"
          type="button"
          class="w-full h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition active:scale-95"
        >
          <Upload class="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <span>Импортировать бэкап (.json / .zip)</span>
        </button>
      </div>

      <!-- Wipe DB Danger Button -->
      <div class="pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          @click="openClearDbConfirmation"
          type="button"
          class="w-full py-2.5 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center justify-center gap-1.5"
        >
          <Trash2 class="w-3.5 h-3.5" />
          <span>Очистить все данные приложения</span>
        </button>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- BLOCK 4: Notifications & PWA Local-First   -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors space-y-3">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 flex items-center justify-center">
          <Shield class="w-4 h-4" />
        </div>
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Автономность и Уведомления
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Local-First PWA с защитой данных
          </p>
        </div>
      </div>

      <div class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
          <div class="flex items-center gap-2">
            <Shield class="w-4 h-4 text-emerald-500" />
            <span>Защита от очистки браузером (Persist)</span>
          </div>
          <span
            class="px-2 py-0.5 rounded text-[10px] font-bold"
            :class="isStoragePersisted ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'"
          >
            {{ isStoragePersisted ? 'Включено' : 'По запросу' }}
          </span>
        </div>

        <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
          <div class="flex items-center gap-2">
            <Bell class="w-4 h-4 text-blue-500" />
            <span>Push-уведомления ТО</span>
          </div>
          <button
            v-if="notificationPermission !== 'granted'"
            @click="requestNotificationPermission"
            type="button"
            class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold text-[11px] hover:bg-blue-700 transition"
          >
            Включить
          </button>
          <span v-else class="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
            Разрешено
          </span>
        </div>
      </div>

      <div class="text-[11px] text-slate-400 text-center pt-2">
        Автокалендарь PWA • Версия 1.0.0 • 100% автономный режим
      </div>
    </div>

    <!-- ========================================== -->
    <!-- MODAL: Import Preview Dialog               -->
    <!-- ========================================== -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isImportPreviewOpen && importFileSummary"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 space-y-4">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
              Восстановление из бэкапа
            </h3>
            <button
              @click="isImportPreviewOpen = false"
              class="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <X class="w-4 h-4" />
            </button>
          </div>

          <div class="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs space-y-1">
            <div class="font-bold text-blue-900 dark:text-blue-200">
              В выбранном файле обнаружено:
            </div>
            <div class="text-slate-600 dark:text-slate-300">
              Автомобиль: <b>{{ importFileSummary.carName }}</b>
            </div>
            <div class="text-slate-600 dark:text-slate-300">
              Заправок: <b>{{ importFileSummary.refuelsCount }}</b> • Заказ-нарядов: <b>{{ importFileSummary.servicesCount }}</b>
            </div>
            <div class="text-slate-600 dark:text-slate-300">
              Запчастей: <b>{{ importFileSummary.partsCount }}</b> • Шин: <b>{{ importFileSummary.tiresCount }}</b>
            </div>
          </div>

          <p class="text-xs text-slate-500">
            Выберите желаемый режим загрузки данных:
          </p>

          <div class="space-y-2 pt-1">
            <button
              @click="executeImport('replace')"
              type="button"
              class="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Trash2 class="w-3.5 h-3.5" />
              <span>Заменить текущую базу полностью</span>
            </button>

            <button
              @click="executeImport('merge')"
              type="button"
              class="w-full h-11 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Объединить / Добавить к текущим</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ========================================== -->
    <!-- MODAL: Clear Database Double Confirmation  -->
    <!-- ========================================== -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isClearDbConfirmOpen"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-red-200 dark:border-red-900/60 animate-in slide-in-from-bottom duration-200 space-y-4">
          <div class="flex items-center gap-2 text-red-600">
            <AlertTriangle class="w-6 h-6" />
            <h3 class="text-base font-bold">
              Внимание: Полный сброс базы
            </h3>
          </div>

          <p class="text-xs text-slate-600 dark:text-slate-400">
            Это действие безвозвратно удалит все автомобили, заправки, заказ-наряды, фотографии и историю обслуживания из памяти устройства. Сначала сделайте резервную копию.
          </p>

          <div v-if="clearDbStep === 2" class="space-y-2">
            <label for="clear-db-confirmation" class="text-xs font-bold text-red-600 dark:text-red-400">
              Для подтверждения введите УДАЛИТЬ
            </label>
            <input
              id="clear-db-confirmation"
              v-model="clearDbConfirmation"
              type="text"
              autocomplete="off"
              class="w-full h-11 px-3 rounded-xl border border-red-300 dark:border-red-800 bg-slate-50 dark:bg-slate-800 text-sm font-bold"
            />
          </div>

          <div class="flex items-center gap-2 pt-2">
            <button
              @click="isClearDbConfirmOpen = false"
              type="button"
              class="flex-1 h-11 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition"
            >
              Отмена
            </button>
            <button
              v-if="clearDbStep === 1"
              @click="clearDbStep = 2"
              type="button"
              class="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition"
            >
              Продолжить
            </button>
            <button
              v-else
              @click="confirmClearDatabase"
              :disabled="clearDbConfirmation !== 'УДАЛИТЬ'"
              type="button"
              class="flex-1 h-11 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition shadow-sm shadow-red-500/30"
            >
              Удалить всё безвозвратно
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ========================================== -->
    <!-- MODAL: Delete Car Confirmation             -->
    <!-- ========================================== -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDeleteCarConfirmOpen && carToDelete"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <div class="bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 space-y-4">
          <div class="flex items-center gap-2 text-red-600">
            <Trash2 class="w-5 h-5" />
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
              Удалить {{ carToDelete.name }}?
            </h3>
          </div>

          <p class="text-xs text-slate-600 dark:text-slate-400">
            Удалить автомобиль <b>{{ carToDelete.name }}</b> и все связанные с ним заправки, заказ-наряды и купленные запчасти? Это действие нельзя будет отменить.
          </p>

          <div class="flex items-center gap-2 pt-2">
            <button
              @click="isDeleteCarConfirmOpen = false"
              type="button"
              class="flex-1 h-11 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition"
            >
              Отмена
            </button>
            <button
              @click="confirmDeleteCar"
              type="button"
              class="flex-1 h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition shadow-sm shadow-red-500/30"
            >
              Удалить машину
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

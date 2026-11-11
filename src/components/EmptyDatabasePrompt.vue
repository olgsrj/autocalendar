<script setup lang="ts">
import { ref } from 'vue';
import JSZip from 'jszip';
import { importInitialBackupData, isCarModalOpen, editingCar, showToast } from '../services/store';
import { db } from '../db';
import { loadAllData } from '../services/store';
import { Car, UploadCloud, PlusCircle, Sparkles } from 'lucide-vue-next';

const isImporting = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function onInitialImport() {
  isImporting.value = true;
  await importInitialBackupData();
  isImporting.value = false;
}

function onAddNewCar() {
  editingCar.value = null;
  isCarModalOpen.value = true;
}

function onCustomFileClick() {
  fileInput.value?.click();
}

async function handleFileUpload(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  isImporting.value = true;
  try {
    let data;
    if (file.name.toLowerCase().endsWith('.zip')) {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const backupJsonFile = contents.file('backup.json');
      if (!backupJsonFile) {
        throw new Error('Файл backup.json не найден внутри архива');
      }
      data = JSON.parse(await backupJsonFile.async('text'));
    } else {
      data = JSON.parse(await file.text());
    }
    await db.importBackup(data, 'replace');
    await loadAllData();
    showToast('База данных успешно загружена!');
  } catch (err) {
    console.error('File import error:', err);
    showToast('Ошибка при чтении файла бэкапа');
  } finally {
    isImporting.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<template>
  <div class="min-h-[75vh] flex items-center justify-center p-4">
    <div class="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200 dark:border-slate-800 text-center">
      <div class="w-16 h-16 mx-auto mb-5 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-inner">
        <Car class="w-8 h-8" />
      </div>

      <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight mb-2">
        Добро пожаловать в Автокалендарь
      </h2>
      <p class="text-sm text-slate-600 dark:text-slate-400 mb-6">
        Локальное автономное PWA-приложение для полного учёта расходов, заправок, ТО и запчастей вашего автомобиля.
      </p>

      <div class="space-y-3">
        <!-- 1-Click Initial Backup Import -->
        <button
          @click="onInitialImport"
          :disabled="isImporting"
          type="button"
          class="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-50"
        >
          <Sparkles class="w-5 h-5 text-amber-300" />
          <span>{{ isImporting ? 'Импортируем данные...' : 'Загрузить данные Lacetti (1 клик)' }}</span>
        </button>

        <!-- Custom backup upload -->
        <button
          @click="onCustomFileClick"
          :disabled="isImporting"
          type="button"
          class="w-full h-12 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 text-sm"
        >
          <UploadCloud class="w-4 h-4 text-slate-500" />
          <span>Импортировать свой .json / .zip бэкап</span>
        </button>

        <!-- Add Empty Car -->
        <button
          @click="onAddNewCar"
          type="button"
          class="w-full h-12 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300 font-semibold rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition text-sm"
        >
          <PlusCircle class="w-4 h-4 text-slate-500" />
          <span>Добавить новый автомобиль с нуля</span>
        </button>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept=".json,.zip"
        class="hidden"
        @change="handleFileUpload"
      />
    </div>
  </div>
</template>

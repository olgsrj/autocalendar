<script setup lang="ts">
import { onMounted } from 'vue';
import {
  currentTab,
  isLoading,
  isDatabaseEmpty,
  loadAllData
} from './services/store';
import Header from './components/Header.vue';
import BottomNav from './components/BottomNav.vue';
import Toast from './components/Toast.vue';
import GarageModal from './components/GarageModal.vue';
import CarModal from './components/CarModal.vue';
import SellCarModal from './components/SellCarModal.vue';
import QuickMileageModal from './components/QuickMileageModal.vue';
import RefuelModal from './components/RefuelModal.vue';
import ServiceModal from './components/ServiceModal.vue';
import EmptyDatabasePrompt from './components/EmptyDatabasePrompt.vue';

// Screens
import HomeScreen from './views/HomeScreen.vue';
import RefuelingsScreen from './views/RefuelingsScreen.vue';
import MaintenanceScreen from './views/MaintenanceScreen.vue';
import PartsTiresScreen from './views/PartsTiresScreen.vue';
import AnalyticsScreen from './views/AnalyticsScreen.vue';
import SettingsScreen from './views/SettingsScreen.vue';

onMounted(async () => {
  await loadAllData();
});
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
    <!-- Header -->
    <Header />

    <!-- Main Content Area -->
    <main class="flex-1 max-w-xl w-full mx-auto pb-24 px-4 pt-3">
      <!-- Loading indicator -->
      <div v-if="isLoading" class="min-h-[50vh] flex flex-col items-center justify-center gap-3">
        <div class="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-sm font-medium text-slate-500 dark:text-slate-400">Загрузка данных...</p>
      </div>

      <!-- Empty database welcome prompt -->
      <EmptyDatabasePrompt v-else-if="isDatabaseEmpty" />

      <!-- Active Screen -->
      <template v-else>
        <HomeScreen v-show="currentTab === 'home'" />
        <RefuelingsScreen v-show="currentTab === 'refuelings'" />
        <MaintenanceScreen v-show="currentTab === 'maintenance'" />
        <PartsTiresScreen v-show="currentTab === 'parts_tires'" />
        <AnalyticsScreen v-if="currentTab === 'analytics'" />
        <SettingsScreen v-show="currentTab === 'settings'" />
      </template>
    </main>

    <!-- Bottom Navigation Bar (Hidden when in Settings) -->
    <BottomNav v-if="!isDatabaseEmpty" />

    <!-- Global Modals -->
    <GarageModal />
    <CarModal />
    <SellCarModal />
    <QuickMileageModal />
    <RefuelModal />
    <ServiceModal />
    <Toast />
  </div>
</template>

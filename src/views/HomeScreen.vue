<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  activeCar,
  currentMileage,
  currentYearMileageInfo,
  dailyPaceKm,
  financialSummary,
  activeMaintenanceRules,
  activeTireSets,
  activeInsurances,
  activeRefuelings,
  activeParts,
  activeServiceEvents,
  activeMiscExpenses,
  isQuickMileageModalOpen,
  isRefuelModalOpen,
  editingRefueling,
  navigateTo,
  navigateToMaintenanceRule,
  navigateToTireSet,
  navigateToInsurance
} from '../services/store';
import {
  formatKm,
  formatCurrency,
  formatDateRu,
  formatDurationRu,
  pluralize,
  calculateOwnershipDays
} from '../services/calculations';
import {
  Edit2,
  Fuel,
  ChevronRight,
  TrendingUp,
  Coins,
  Calendar
} from 'lucide-vue-next';

// Period filter for Financial Summary
const selectedPeriod = ref<'all' | 'year' | 'month'>('all');
const showAllAlerts = ref(false);

const currentYear = new Date().getFullYear();

// Fuel consumption metrics
const fuelConsumptionStats = computed(() => {
  const fullRefuels = activeRefuelings.value.filter(r => r.isFullTank && r.consumption && r.consumption > 0);
  if (fullRefuels.length === 0) {
    return { avg: null, last: null, range: null };
  }

  const sumConsumption = fullRefuels.reduce((acc, r) => acc + (r.consumption || 0), 0);
  const avg = Math.round((sumConsumption / fullRefuels.length) * 100) / 100;

  // Last full refuel
  const sorted = [...fullRefuels].sort((a, b) => b.mileage - a.mileage);
  const last = sorted[0]?.consumption || null;
  const range = last ? Math.round(((activeCar.value?.tankVolume || 60) / last) * 100) : null;

  return { avg, last, range };
});

// Ownership duration text
const ownershipDurationText = computed(() => {
  const car = activeCar.value;
  if (!car) return '';
  const days = calculateOwnershipDays(car.purchaseDate, car.soldDate);
  const years = Math.floor(days / 365);
  const remainingDays = days % 365;
  const months = Math.floor(remainingDays / 30);

  const parts: string[] = [];
  if (years > 0) parts.push(pluralize(years, 'год', 'года', 'лет'));
  if (months > 0) parts.push(pluralize(months, 'мес.', 'мес.', 'мес.'));

  return `${parts.join(' ')} (${days.toLocaleString('ru-RU')} дн.)`;
});

// Attention Alerts Aggregator
interface AttentionAlert {
  id: string;
  type: 'rule' | 'tire' | 'insurance';
  targetId: string;
  isCritical: boolean;
  title: string;
  subtitle: string;
  kmBadge?: { text: string; isCritical: boolean } | null;
  daysBadge?: { text: string; isCritical: boolean } | null;
}

const attentionAlerts = computed<AttentionAlert[]>(() => {
  const alerts: AttentionAlert[] = [];
  const curKm = currentMileage.value;
  const today = new Date().toISOString().split('T')[0];

  // 1. Maintenance Rules
  for (const rule of activeMaintenanceRules.value) {
    if (!rule.notifyEnabled) continue;

    let isOverdueKm = false;
    let isUrgentKm = false;
    let kmBadgeText = '';

    if (rule.intervalKm && rule.lastReplacedKm) {
      const remainingKm = rule.lastReplacedKm + rule.intervalKm - curKm;
      if (remainingKm < 0) {
        isOverdueKm = true;
        kmBadgeText = `Просрочено на ${formatKm(Math.abs(remainingKm))}`;
      } else if (remainingKm <= 1000) {
        isUrgentKm = true;
        kmBadgeText = `Осталось ${formatKm(remainingKm)}`;
      } else {
        kmBadgeText = `Осталось ${formatKm(remainingKm)}`;
      }
    }

    let isOverdueDays = false;
    let isUrgentDays = false;
    let daysBadgeText = '';

    if (rule.intervalDays && rule.lastReplacedDate) {
      const start = new Date(rule.lastReplacedDate).getTime();
      const nextDate = start + rule.intervalDays * 24 * 3600 * 1000;
      const diffDays = Math.ceil((nextDate - new Date(today).getTime()) / (24 * 3600 * 1000));

      daysBadgeText = formatDurationRu(diffDays);
      if (diffDays < 0) {
        isOverdueDays = true;
      } else if (diffDays <= 30) {
        isUrgentDays = true;
      }
    }

    const isCritical = isOverdueKm || isOverdueDays;
    const isUrgent = isUrgentKm || isUrgentDays;

    if (isCritical || isUrgent) {
      alerts.push({
        id: `alert-rule-${rule.id}`,
        type: 'rule',
        targetId: rule.id,
        isCritical,
        title: rule.name,
        subtitle: `Интервал: ${rule.intervalKm ? formatKm(rule.intervalKm) : ''}${rule.intervalKm && rule.intervalDays ? ' / ' : ''}${rule.intervalDays ? `${rule.intervalDays} дн.` : ''}`,
        kmBadge: kmBadgeText ? { text: kmBadgeText, isCritical: isOverdueKm } : null,
        daysBadge: daysBadgeText ? { text: daysBadgeText, isCritical: isOverdueDays } : null
      });
    }
  }

  // 2. Tire Age Warning
  for (const tire of activeTireSets.value) {
    if (!tire.isArchived) {
      const age = currentYear - tire.manufactureYear;
      const maxAge = tire.recommendedMaxAgeYears || 6;
      if (age >= maxAge) {
        alerts.push({
          id: `alert-tire-${tire.id}`,
          type: 'tire',
          targetId: tire.id,
          isCritical: age > maxAge,
          title: `${tire.name}: возраст ${pluralize(age, 'год', 'года', 'лет')}`,
          subtitle: `Рекомендуемый срок службы — до ${maxAge} лет. Проверьте микротрещины!`,
          kmBadge: null,
          daysBadge: { text: `Шинам ${age} лет`, isCritical: true }
        });
      }

      if (tire.isMounted) {
        const month = new Date().getMonth();
        const isWinterSeason = month >= 10 || month <= 2;
        const wrongSeason = (isWinterSeason && tire.season === 'summer')
          || (month >= 4 && month <= 8 && tire.season !== 'summer');
        if (wrongSeason) {
          alerts.push({
            id: `alert-tire-season-${tire.id}`,
            type: 'tire',
            targetId: tire.id,
            isCritical: false,
            title: 'Сезон сменился: не забудьте отметить смену колёс',
            subtitle: `Сейчас на автомобиле: ${tire.name}`,
            kmBadge: null,
            daysBadge: { text: 'Сезонная смена', isCritical: false }
          });
        }
      }
    }
  }

  // 3. Insurance Expiration
  for (const ins of activeInsurances.value) {
    const end = new Date(ins.endDate).getTime();
    const remainingDays = Math.ceil((end - new Date(today).getTime()) / (24 * 3600 * 1000));
    if (remainingDays <= 30) {
      alerts.push({
        id: `alert-ins-${ins.id}`,
        type: 'insurance',
        targetId: ins.id,
        isCritical: remainingDays < 0,
        title: `Полис ОСАГО (${ins.company})`,
        subtitle: remainingDays < 0 ? 'Срок действия полиса истёк!' : `Истекает через ${pluralize(remainingDays, 'день', 'дня', 'дней')}`,
        kmBadge: null,
        daysBadge: { text: remainingDays < 0 ? 'Истёк' : `${remainingDays} дн.`, isCritical: remainingDays < 0 }
      });
    }
  }

  // Sort: Critical (red) first, then warning
  return alerts.sort((a, b) => {
    if (a.isCritical && !b.isCritical) return -1;
    if (!a.isCritical && b.isCritical) return 1;
    return 0;
  });
});

const visibleAlerts = computed(() => {
  if (showAllAlerts.value) return attentionAlerts.value;
  return attentionAlerts.value.slice(0, 3);
});

function handleAlertClick(alert: AttentionAlert) {
  if (alert.type === 'rule') {
    navigateToMaintenanceRule(alert.targetId);
  } else if (alert.type === 'tire') {
    navigateToTireSet(alert.targetId);
  } else if (alert.type === 'insurance') {
    navigateToInsurance(alert.targetId);
  }
}

// Period-filtered Financial Breakdown
const periodMetrics = computed(() => {
  const period = selectedPeriod.value;
  const currentYearStr = String(currentYear);
  const now = new Date();
  const currentMonthStr = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const filterByDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return false;
    if (period === 'all') return true;
    if (period === 'year') return dateStr.startsWith(currentYearStr);
    if (period === 'month') return dateStr.startsWith(currentMonthStr);
    return true;
  };

  const fuel = activeRefuelings.value
    .filter(r => filterByDate(r.date))
    .reduce((sum, r) => sum + (r.actualCost || 0), 0);

  const parts = activeParts.value
    .filter(p => p.status !== 'wishlist' && filterByDate(p.purchaseDate || p.installedDate))
    .reduce((sum, p) => sum + (p.totalPrice || 0), 0);

  const service = activeServiceEvents.value
    .filter(s => filterByDate(s.date))
    .reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);

  const misc = activeMiscExpenses.value
    .filter(m => filterByDate(m.date))
    .reduce((sum, m) => sum + (m.cost || 0), 0)
    + activeInsurances.value
      .filter(policy => policy.isIncludedInExpenses && filterByDate(policy.startDate))
      .reduce((sum, policy) => sum + policy.cost, 0);

  const maintenance = Math.round((fuel + parts + service + misc) * 100) / 100;
  const car = activeCar.value;
  const purchase = (car && period === 'all')
    ? car.purchasePrice + (car.selectionServiceCost || 0)
      + (car.extraPurchaseCosts || []).reduce((sum, cost) => sum + cost.cost, 0)
    : 0;
  const grand = maintenance + purchase;

  return { fuel, parts, service, misc, maintenance, purchase, grand };
});

function openNewRefuelModal() {
  editingRefueling.value = null;
  isRefuelModalOpen.value = true;
}
</script>

<template>
  <div class="space-y-4">
    <!-- Block 2: Odometer Mileage Card -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800">
        <!-- Total Mileage -->
        <div class="pr-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Общий пробег
            </span>
            <button
              @click="isQuickMileageModalOpen = true"
              type="button"
              class="w-6 h-6 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition active:scale-95"
              title="Обновить пробег"
            >
              <Edit2 class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight font-mono">
            {{ formatKm(currentMileage) }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            Мой пробег: {{ formatKm(financialSummary.ownedMileage) }}
            <span v-if="activeCar?.purchaseDate"> (с {{ formatDateRu(activeCar.purchaseDate) }})</span>
          </div>
        </div>

        <!-- Current Year Mileage -->
        <div class="pl-3.5">
          <span class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">
            За {{ currentYear }} год
          </span>
          <div class="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight font-mono">
            {{ formatKm(currentYearMileageInfo.yearMileage) }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            ~{{ Math.round(dailyPaceKm * 30) }} км/мес
            (~{{ Math.round(dailyPaceKm) }} км/день)
          </div>
        </div>
      </div>
    </div>

    <!-- Block 3: Primary CTA — Add Refuel Button -->
    <button
      @click="openNewRefuelModal"
      type="button"
      class="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2.5 shadow-lg shadow-blue-500/25 active:scale-[0.98] transition tracking-wide text-base"
    >
      <Fuel class="w-6 h-6 stroke-[2.5]" />
      <span>Добавить заправку</span>
    </button>

    <!-- Block 4: Attention Needed Section -->
    <div v-if="attentionAlerts.length > 0" class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex items-center justify-between mb-3.5">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950/80 text-red-600 dark:text-red-400 flex items-center justify-center font-bold text-xs">
            {{ attentionAlerts.length }}
          </div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Требует внимания
          </h3>
        </div>
        <span class="text-xs text-slate-400">
          Срочные работы
        </span>
      </div>

      <!-- Alerts List -->
      <div class="space-y-2.5">
        <button
          v-for="alert in visibleAlerts"
          :key="alert.id"
          type="button"
          @click="handleAlertClick(alert)"
          class="w-full text-left p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99]"
          :class="alert.isCritical
            ? 'border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
            : 'border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/30'"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span
                class="w-2 h-2 rounded-full shrink-0"
                :class="alert.isCritical ? 'bg-red-500 animate-pulse' : 'bg-amber-500'"
              ></span>
              <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                {{ alert.title }}
              </h4>
            </div>

            <div class="flex flex-wrap items-center gap-1.5 text-xs">
              <span
                v-if="alert.kmBadge"
                class="px-2 py-0.5 rounded-md font-semibold text-[11px]"
                :class="alert.kmBadge.isCritical
                  ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'"
              >
                {{ alert.kmBadge.text }}
              </span>
              <span
                v-if="alert.daysBadge"
                class="px-2 py-0.5 rounded-md font-semibold text-[11px]"
                :class="alert.daysBadge.isCritical
                  ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'"
              >
                {{ alert.daysBadge.text }}
              </span>
            </div>
          </div>

          <ChevronRight class="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>

      <!-- Show more toggle -->
      <button
        v-if="attentionAlerts.length > 3"
        @click="showAllAlerts = !showAllAlerts"
        type="button"
        class="w-full mt-3 pt-2 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
      >
        {{ showAllAlerts ? 'Свернуть список ▴' : `Показать все (${attentionAlerts.length}) ▾` }}
      </button>
    </div>

    <!-- Block 5: Key Metrics (2x2 Grid) -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base mb-3.5">
        Ключевые метрики
      </h3>

      <div class="grid grid-cols-2 gap-3">
        <!-- 1. Fuel Consumption -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <Fuel class="w-3.5 h-3.5 text-blue-500" />
            <span>Расход топлива</span>
          </div>
          <div class="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {{ fuelConsumptionStats.avg ? `${fuelConsumptionStats.avg} л` : '—' }}
            <span class="text-xs font-normal text-slate-500">/ 100 км</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            <span v-if="fuelConsumptionStats.last">Посл.: {{ fuelConsumptionStats.last }} л</span>
            <span v-if="fuelConsumptionStats.range"> • Бака: ~{{ fuelConsumptionStats.range }} км</span>
          </div>
        </div>

        <!-- 2. Cost per 1 km -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <Coins class="w-3.5 h-3.5 text-amber-500" />
            <span>Стоимость 1 км</span>
          </div>
          <div class="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {{ formatCurrency(financialSummary.costPerKm, true) }}
            <span class="text-xs font-normal text-slate-500">/ км</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            С покупкой: {{ formatCurrency(financialSummary.costPerKmWithPurchase, true) }}/км
          </div>
        </div>

        <!-- 3. Cost per day / month -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <TrendingUp class="w-3.5 h-3.5 text-emerald-500" />
            <span>Стоимость в день</span>
          </div>
          <div class="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
            {{ formatCurrency(financialSummary.costPerDay) }}
            <span class="text-xs font-normal text-slate-500">/ день</span>
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {{ formatCurrency(financialSummary.costPerMonth) }}/мес
            <span v-if="financialSummary.percentOfSalary" class="text-blue-600 dark:text-blue-400 font-semibold">
              ({{ financialSummary.percentOfSalary }}%)
            </span>
          </div>
        </div>

        <!-- 4. Ownership duration & Saved discounts -->
        <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-semibold mb-1">
            <Calendar class="w-3.5 h-3.5 text-purple-500" />
            <span>Стаж владения</span>
          </div>
          <div class="text-sm font-black text-slate-900 dark:text-slate-100 truncate">
            {{ ownershipDurationText }}
          </div>
          <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mt-1 truncate">
            Скидки АЗС: {{ formatCurrency(financialSummary.totalSavedDiscounts) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Block 6: Financial Summary Section -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
          Финансовая сводка
        </h3>

        <!-- Period selector chips -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
          <button
            @click="selectedPeriod = 'all'"
            type="button"
            class="px-2.5 py-1 rounded-lg transition"
            :class="selectedPeriod === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400'"
          >
            Всё время
          </button>
          <button
            @click="selectedPeriod = 'year'"
            type="button"
            class="px-2.5 py-1 rounded-lg transition"
            :class="selectedPeriod === 'year' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400'"
          >
            {{ currentYear }}
          </button>
          <button
            @click="selectedPeriod = 'month'"
            type="button"
            class="px-2.5 py-1 rounded-lg transition"
            :class="selectedPeriod === 'month' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-bold' : 'text-slate-500 dark:text-slate-400'"
          >
            Месяц
          </button>
        </div>
      </div>

      <!-- Totals -->
      <div class="mb-4">
        <div class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
          Всего на содержание:
        </div>
        <div class="text-3xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
          {{ formatCurrency(periodMetrics.maintenance) }}
        </div>
        <div v-if="selectedPeriod === 'all' && periodMetrics.purchase > 0" class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Всего с покупкой авто: <span class="font-bold text-slate-700 dark:text-slate-300">{{ formatCurrency(periodMetrics.grand) }}</span>
        </div>
      </div>

      <!-- Multi-color Stacked Bar -->
      <div class="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex mb-4">
        <div
          class="bg-blue-600 transition-all duration-300"
          :style="{ width: `${periodMetrics.maintenance ? (periodMetrics.fuel / periodMetrics.maintenance) * 100 : 0}%` }"
          title="Топливо"
        ></div>
        <div
          class="bg-amber-500 transition-all duration-300"
          :style="{ width: `${periodMetrics.maintenance ? (periodMetrics.parts / periodMetrics.maintenance) * 100 : 0}%` }"
          title="Запчасти"
        ></div>
        <div
          class="bg-emerald-500 transition-all duration-300"
          :style="{ width: `${periodMetrics.maintenance ? (periodMetrics.service / periodMetrics.maintenance) * 100 : 0}%` }"
          title="Сервис"
        ></div>
        <div
          class="bg-purple-500 transition-all duration-300"
          :style="{ width: `${periodMetrics.maintenance ? (periodMetrics.misc / periodMetrics.maintenance) * 100 : 0}%` }"
          title="Прочее"
        ></div>
      </div>

      <!-- Interactive Categories List -->
      <div class="space-y-1.5 divide-y divide-slate-100 dark:divide-slate-800/80">
        <!-- 1. Fuel -->
        <div
          @click="navigateTo('refuelings')"
          class="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></div>
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Топливо (Бензин)
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodMetrics.fuel) }}
            </span>
            <span class="text-[11px] text-slate-400 font-mono w-12 text-right">
              {{ periodMetrics.maintenance ? Math.round((periodMetrics.fuel / periodMetrics.maintenance) * 100) : 0 }}%
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        <!-- 2. Parts -->
        <div
          @click="navigateTo('parts_tires')"
          class="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></div>
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Запчасти и расходники
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodMetrics.parts) }}
            </span>
            <span class="text-[11px] text-slate-400 font-mono w-12 text-right">
              {{ periodMetrics.maintenance ? Math.round((periodMetrics.parts / periodMetrics.maintenance) * 100) : 0 }}%
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        <!-- 3. Service -->
        <div
          @click="navigateTo('maintenance')"
          class="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></div>
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Сервис и ремонт
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodMetrics.service) }}
            </span>
            <span class="text-[11px] text-slate-400 font-mono w-12 text-right">
              {{ periodMetrics.maintenance ? Math.round((periodMetrics.service / periodMetrics.maintenance) * 100) : 0 }}%
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        <!-- 4. Misc -->
        <div
          @click="navigateTo('analytics')"
          class="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-purple-500 shrink-0"></div>
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Прочие траты (налоги, уход, ОСАГО)
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodMetrics.misc) }}
            </span>
            <span class="text-[11px] text-slate-400 font-mono w-12 text-right">
              {{ periodMetrics.maintenance ? Math.round((periodMetrics.misc / periodMetrics.maintenance) * 100) : 0 }}%
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        <!-- 5. Car Purchase (Only shown in 'all' period) -->
        <div
          v-if="selectedPeriod === 'all' && periodMetrics.purchase > 0"
          @click="navigateTo('settings')"
          class="pt-2 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 p-2 rounded-xl transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-slate-400 shrink-0"></div>
            <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Покупка автомобиля + подбор
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-600 dark:text-slate-400 font-mono">
              {{ formatCurrency(periodMetrics.purchase) }}
            </span>
            <ChevronRight class="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

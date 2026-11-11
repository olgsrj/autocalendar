<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import {
  Chart as ChartJS,
  DoughnutController,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  type ChartData,
  type ChartOptions
} from 'chart.js';
import {
  activeCar,
  activeRefuelings,
  activeParts,
  activeServiceEvents,
  activeMiscExpenses,
  activeInsurances,
  appSettings,
  navigateTo
} from '../services/store';
import {
  formatCurrency,
  formatKm,
  formatDateRu
} from '../services/calculations';
import {
  Fuel,
  Wrench,
  Package,
  Receipt,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Calendar,
  Sparkles
} from 'lucide-vue-next';

// Register Chart.js components
ChartJS.register(
  DoughnutController,
  BarController,
  LineController,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler
);

// 1. Period Filter
const selectedYear = ref<'all' | number>('all');
const showDiscounts = ref<boolean>(true);
const selectedFuelType = ref<string>('all');
const consumptionViewMode = ref<'refuels' | 'monthly'>('refuels');
const isTableExpanded = ref<boolean>(false);

// Canvas DOM references
const donutCanvas = ref<HTMLCanvasElement | null>(null);
const barCanvas = ref<HTMLCanvasElement | null>(null);
const priceLineCanvas = ref<HTMLCanvasElement | null>(null);
const consumptionLineCanvas = ref<HTMLCanvasElement | null>(null);

// Chart instances
let donutChart: ChartJS | null = null;
let barChart: ChartJS | null = null;
let priceLineChart: ChartJS | null = null;
let consumptionLineChart: ChartJS | null = null;

// Available years from dataset
const availableYears = computed<number[]>(() => {
  const yearsSet = new Set<number>();
  if (activeCar.value?.purchaseDate) {
    const y = parseInt(activeCar.value.purchaseDate.substring(0, 4), 10);
    if (!isNaN(y)) yearsSet.add(y);
  }
  for (const r of activeRefuelings.value) {
    if (r.date) {
      const y = parseInt(r.date.substring(0, 4), 10);
      if (!isNaN(y)) yearsSet.add(y);
    }
  }
  for (const s of activeServiceEvents.value) {
    if (s.date) {
      const y = parseInt(s.date.substring(0, 4), 10);
      if (!isNaN(y)) yearsSet.add(y);
    }
  }
  return Array.from(yearsSet).sort((a, b) => b - a); // Descending (2026, 2025...)
});

// Fuel types present in data
const availableFuelTypes = computed<string[]>(() => {
  const typesSet = new Set<string>();
  for (const r of activeRefuelings.value) {
    if (r.fuelType) typesSet.add(r.fuelType);
  }
  return Array.from(typesSet);
});

// Is dark theme active
const isDarkTheme = computed(() => {
  if (appSettings.value.theme === 'dark') return true;
  if (appSettings.value.theme === 'system') {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
});

// 2. Data Filtering for Donut & Details
const periodFilteredData = computed(() => {
  const year = selectedYear.value;
  const isAll = year === 'all';
  const yearStr = isAll ? '' : String(year);

  // Refuelings
  const refuels = activeRefuelings.value.filter(r => (isAll ? true : r.date.startsWith(yearStr)));
  const fuelCost = refuels.reduce((sum, r) => sum + (r.actualCost || 0), 0);

  // Parts (only bought parts)
  const parts = activeParts.value.filter(p => {
    if (p.status === 'wishlist') return false;
    if (isAll) return true;
    const d = p.purchaseDate || p.installedDate;
    return d ? d.startsWith(yearStr) : false;
  });
  const partsCost = parts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);

  // Service
  const services = activeServiceEvents.value.filter(s => (isAll ? true : s.date.startsWith(yearStr)));
  const serviceCost = services.reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);

  // Misc
  const misc = activeMiscExpenses.value.filter(m => (isAll ? true : m.date.startsWith(yearStr)));
  const policies = activeInsurances.value.filter(policy => policy.isIncludedInExpenses && (isAll || policy.startDate.startsWith(yearStr)));
  const miscCost = misc.reduce((sum, m) => sum + (m.cost || 0), 0)
    + policies.reduce((sum, policy) => sum + (policy.cost || 0), 0);

  const maintenanceTotal = fuelCost + partsCost + serviceCost + miscCost;

  // Calculate km for this period
  let periodMileage = 0;
  if (isAll) {
    const car = activeCar.value;
    const curKm = car?.currentMileage || car?.purchaseMileage || 0;
    const startKm = car?.purchaseMileage || 0;
    periodMileage = Math.max(1, curKm - startKm);
  } else {
    // Find min and max mileage in this year
    const kms = [
      ...refuels.map(r => r.mileage).filter((k): k is number => k !== null && k > 0),
      ...services.map(s => s.mileage).filter((k): k is number => k !== null && k > 0)
    ];
    if (kms.length > 0) {
      const maxKm = Math.max(...kms);
      // find previous year end
      const prevRefuels = activeRefuelings.value.filter(r => r.date < `${yearStr}-01-01` && r.mileage);
      const prevServices = activeServiceEvents.value.filter(s => s.date < `${yearStr}-01-01` && s.mileage);
      const prevKms = [
        activeCar.value?.purchaseMileage || 0,
        ...prevRefuels.map(r => r.mileage as number),
        ...prevServices.map(s => s.mileage as number)
      ];
      const startKm = Math.max(...prevKms);
      periodMileage = Math.max(1, maxKm - startKm);
    }
  }

  const costPerKm = periodMileage > 0 ? maintenanceTotal / periodMileage : 0;

  return {
    fuelCost,
    partsCost,
    serviceCost,
    miscCost,
    maintenanceTotal,
    periodMileage,
    costPerKm,
    fuelPerKm: periodMileage > 0 ? fuelCost / periodMileage : 0,
    partsPerKm: periodMileage > 0 ? partsCost / periodMileage : 0,
    servicePerKm: periodMileage > 0 ? serviceCost / periodMileage : 0,
    miscPerKm: periodMileage > 0 ? miscCost / periodMileage : 0,
    fuelPercent: maintenanceTotal > 0 ? (fuelCost / maintenanceTotal) * 100 : 0,
    partsPercent: maintenanceTotal > 0 ? (partsCost / maintenanceTotal) * 100 : 0,
    servicePercent: maintenanceTotal > 0 ? (serviceCost / maintenanceTotal) * 100 : 0,
    miscPercent: maintenanceTotal > 0 ? (miscCost / maintenanceTotal) * 100 : 0
  };
});

// 3. Annual Breakdown Data for Chart 2 & Table
interface AnnualStats {
  year: number;
  mileage: number;
  monthlyAvgKm: number;
  liters: number;
  maintenanceCost: number;
  costPerKm: number;
}

const annualStatsList = computed<AnnualStats[]>(() => {
  const yearsAsc = [...availableYears.value].sort((a, b) => a - b);
  const result: AnnualStats[] = [];

  let prevMaxKm = activeCar.value?.purchaseMileage || 0;

  for (const year of yearsAsc) {
    const yStr = String(year);
    const r_y = activeRefuelings.value.filter(r => r.date.startsWith(yStr));
    const s_y = activeServiceEvents.value.filter(s => s.date.startsWith(yStr));
    const p_y = activeParts.value.filter(p => p.status !== 'wishlist' && (p.purchaseDate?.startsWith(yStr) || p.installedDate?.startsWith(yStr)));
    const m_y = activeMiscExpenses.value.filter(m => m.date.startsWith(yStr));
    const i_y = activeInsurances.value.filter(policy => policy.isIncludedInExpenses && policy.startDate.startsWith(yStr));

    const kms = [
      ...r_y.map(r => r.mileage).filter((k): k is number => k !== null && k > 0),
      ...s_y.map(s => s.mileage).filter((k): k is number => k !== null && k > 0)
    ];

    let yearMileage = 0;
    if (kms.length > 0) {
      const curMax = Math.max(...kms);
      yearMileage = Math.max(0, curMax - prevMaxKm);
      prevMaxKm = curMax;
    }

    const liters = r_y.reduce((sum, r) => sum + (r.liters || 0), 0);
    const fuelCost = r_y.reduce((sum, r) => sum + (r.actualCost || 0), 0);
    const partsCost = p_y.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const serviceCost = s_y.reduce((sum, s) => sum + (s.totalLaborCost || 0), 0);
    const miscCost = m_y.reduce((sum, m) => sum + (m.cost || 0), 0)
      + i_y.reduce((sum, policy) => sum + (policy.cost || 0), 0);
    const maintenanceCost = fuelCost + partsCost + serviceCost + miscCost;

    // Months active in year
    const currentYear = new Date().getFullYear();
    let months = 12;
    if (year === currentYear) {
      months = Math.max(1, new Date().getMonth() + 1);
    } else if (activeCar.value?.purchaseDate && year === parseInt(activeCar.value.purchaseDate.substring(0, 4), 10)) {
      const purchaseMonth = parseInt(activeCar.value.purchaseDate.substring(5, 7), 10);
      months = Math.max(1, 12 - purchaseMonth + 1);
    }

    const monthlyAvgKm = Math.round(yearMileage / months);
    const costPerKm = yearMileage > 0 ? maintenanceCost / yearMileage : 0;

    result.push({
      year,
      mileage: yearMileage,
      monthlyAvgKm,
      liters,
      maintenanceCost,
      costPerKm
    });
  }

  return result;
});

// Average Annual Mileage
const averageAnnualMileage = computed(() => {
  const list = annualStatsList.value;
  if (list.length === 0) return 0;
  const currentYear = new Date().getFullYear();
  // We can calculate avg excluding in-progress current year or weighted
  const fullYears = list.filter(item => item.year < currentYear);
  if (fullYears.length > 0) {
    const total = fullYears.reduce((sum, item) => sum + item.mileage, 0);
    return Math.round(total / fullYears.length);
  }
  const total = list.reduce((sum, item) => sum + item.mileage, 0);
  return Math.round(total / list.length);
});

// 4. Fuel Station Price Stats (Chart 3)
const fuelPriceStats = computed(() => {
  let refuels = [...activeRefuelings.value]
    .filter(r => r.stationPrice !== null && r.stationPrice > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (selectedYear.value !== 'all') {
    refuels = refuels.filter(r => r.date.startsWith(String(selectedYear.value)));
  }

  if (selectedFuelType.value !== 'all') {
    refuels = refuels.filter(r => r.fuelType === selectedFuelType.value);
  }

  if (refuels.length === 0) {
    return { min: 0, current: 0, growthPct: 0, data: [] };
  }

  const prices = refuels.map(r => r.stationPrice as number);
  const min = Math.min(...prices);
  const current = refuels[refuels.length - 1].stationPrice || 0;
  const first = refuels[0].stationPrice || min;
  const growthPct = first > 0 ? Math.round(((current - first) / first) * 1000) / 10 : 0;

  return {
    min,
    current,
    growthPct,
    data: refuels
  };
});

// 5. Fuel Consumption Stats (Chart 4)
const fuelConsumptionStats = computed(() => {
  let refuels = [...activeRefuelings.value]
    .filter(r => r.consumption !== null && r.consumption > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (selectedYear.value !== 'all') {
    refuels = refuels.filter(r => r.date.startsWith(String(selectedYear.value)));
  }

  if (refuels.length === 0) {
    return { avg: 0, min: 0, max: 0, items: [] };
  }

  const consumptions = refuels.map(r => r.consumption as number);
  const min = Math.min(...consumptions);
  const max = Math.max(...consumptions);
  const sum = consumptions.reduce((acc, c) => acc + c, 0);
  const avg = Math.round((sum / consumptions.length) * 100) / 100;

  return {
    avg,
    min,
    max,
    items: refuels
  };
});

// 6. Chart Initialization and Updates
function initDonutChart() {
  if (!donutCanvas.value) return;
  if (donutChart) {
    donutChart.destroy();
    donutChart = null;
  }

  const data = periodFilteredData.value;
  const isDark = isDarkTheme.value;

  const chartData: ChartData<'doughnut'> = {
    labels: ['Топливо', 'Запчасти', 'Сервис', 'Прочее'],
    datasets: [
      {
        data: [data.fuelCost, data.partsCost, data.serviceCost, data.miscCost],
        backgroundColor: [
          '#2563eb', // blue
          '#f59e0b', // amber
          '#10b981', // emerald
          '#8b5cf6'  // purple
        ],
        borderColor: isDark ? '#0f172a' : '#ffffff',
        borderWidth: 3,
        hoverOffset: 6
      }
    ]
  };

  const chartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '74%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#0f172a',
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw as number;
            const pct = data.maintenanceTotal > 0 ? Math.round((val / data.maintenanceTotal) * 100) : 0;
            return ` ${formatCurrency(val)} (${pct}%)`;
          }
        }
      }
    }
  };

  donutChart = new ChartJS(donutCanvas.value, {
    type: 'doughnut',
    data: chartData,
    options: chartOptions
  });
}

function initBarChart() {
  if (!barCanvas.value) return;
  if (barChart) {
    barChart.destroy();
    barChart = null;
  }

  const list = annualStatsList.value;
  const isDark = isDarkTheme.value;
  const activeYear = selectedYear.value;
  const avgMileage = averageAnnualMileage.value;

  const labels = list.map(item => String(item.year));
  const mileageData = list.map(item => item.mileage);

  const backgroundColors = list.map(item => {
    if (activeYear !== 'all' && item.year === activeYear) {
      return '#2563eb'; // Active vibrant blue
    }
    return isDark ? '#3b82f6' : '#60a5fa';
  });

  const chartData: ChartData<'bar' | 'line'> = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Пробег (км)',
        data: mileageData,
        backgroundColor: backgroundColors,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 42
      },
      {
        type: 'line',
        label: `Ср. годовой (~${avgMileage.toLocaleString('ru-RU')} км)`,
        data: labels.map(() => avgMileage),
        borderColor: '#ef4444',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false
      }
    ]
  };

  // Custom plugin to render exact numbers directly above each bar
  const barTextPlugin = {
    id: 'barTextAbovePlugin',
    afterDatasetsDraw(chart: ChartJS) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;

      ctx.save();
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
      ctx.textAlign = 'center';

      meta.data.forEach((bar, idx) => {
        const val = mileageData[idx];
        if (val && val > 0) {
          ctx.fillText(`${val.toLocaleString('ru-RU')} км`, bar.x, bar.y - 6);
        }
      });
      ctx.restore();
    }
  };

  const chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 22 }
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        align: 'center',
        labels: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: { size: 11 },
          boxWidth: 12,
          padding: 14
        }
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#0f172a',
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw as number;
            return ` ${ctx.dataset.label}: ${formatKm(val)}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: { weight: 'bold', size: 12 }
        }
      },
      y: {
        grid: {
          color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          callback: (val) => `${Number(val) / 1000}k`
        }
      }
    }
  };

  barChart = new ChartJS(barCanvas.value, {
    type: 'bar',
    data: chartData as any,
    options: chartOptions as any,
    plugins: [barTextPlugin]
  });
}

function initPriceLineChart() {
  if (!priceLineCanvas.value) return;
  if (priceLineChart) {
    priceLineChart.destroy();
    priceLineChart = null;
  }

  const { data: refuels } = fuelPriceStats.value;
  const isDark = isDarkTheme.value;

  const labels = refuels.map(r => formatDateRu(r.date));
  const prices = refuels.map(r => r.stationPrice || 0);

  // Discounted points
  const discountPoints = refuels.map(r => {
    if (showDiscounts.value && (r.discountAmount || 0) > 0 && r.effectiveLiterPrice) {
      return r.effectiveLiterPrice;
    }
    return null;
  });

  const chartData: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: 'Цена на стеле (₽/л)',
        data: prices,
        borderColor: '#2563eb',
        backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: 2,
        pointHoverRadius: 5
      }
    ]
  };

  if (showDiscounts.value) {
    chartData.datasets.push({
      label: 'Реальная цена со скидкой (₽/л)',
      data: discountPoints,
      borderColor: '#10b981',
      backgroundColor: '#10b981',
      borderWidth: 0,
      pointRadius: 4,
      pointHoverRadius: 6,
      showLine: false
    });
  }

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: { size: 11 },
          boxWidth: 10
        }
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#0f172a',
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw as number | null;
            if (val === null) return '';
            return ` ${ctx.dataset.label}: ${val.toFixed(2)} ₽/л`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          maxTicksLimit: 7,
          font: { size: 10 }
        }
      },
      y: {
        grid: {
          color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          callback: (val) => `${val} ₽`
        }
      }
    }
  };

  priceLineChart = new ChartJS(priceLineCanvas.value, {
    type: 'line',
    data: chartData,
    options: chartOptions
  });
}

function initConsumptionLineChart() {
  if (!consumptionLineCanvas.value) return;
  if (consumptionLineChart) {
    consumptionLineChart.destroy();
    consumptionLineChart = null;
  }

  const { items, avg } = fuelConsumptionStats.value;
  const isDark = isDarkTheme.value;

  let labels: string[] = [];
  let values: number[] = [];

  if (consumptionViewMode.value === 'refuels') {
    labels = items.map(r => formatDateRu(r.date));
    values = items.map(r => r.consumption || 0);
  } else {
    // Group monthly
    const monthMap = new Map<string, { sum: number; count: number }>();
    for (const r of items) {
      const m = r.date.substring(0, 7); // YYYY-MM
      const current = monthMap.get(m) || { sum: 0, count: 0 };
      current.sum += r.consumption || 0;
      current.count += 1;
      monthMap.set(m, current);
    }
    const sortedMonths = Array.from(monthMap.keys()).sort();
    labels = sortedMonths.map(m => {
      const parts = m.split('-');
      return `${parts[1]}.${parts[0]}`;
    });
    values = sortedMonths.map(m => {
      const item = monthMap.get(m)!;
      return Math.round((item.sum / item.count) * 100) / 100;
    });
  }

  const chartData: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: 'Расход (л/100 км)',
        data: values,
        borderColor: '#f59e0b',
        backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(245, 158, 11, 0.08)',
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointRadius: consumptionViewMode.value === 'monthly' ? 4 : 2,
        pointHoverRadius: 5
      },
      {
        label: `Средний (~${avg.toFixed(2)} л)`,
        data: labels.map(() => avg),
        borderColor: '#ef4444',
        borderWidth: 2,
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false
      }
    ]
  };

  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'end',
        labels: {
          color: isDark ? '#94a3b8' : '#64748b',
          font: { size: 11 },
          boxWidth: 10
        }
      },
      tooltip: {
        backgroundColor: isDark ? '#1e293b' : '#0f172a',
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw as number;
            return ` ${ctx.dataset.label}: ${val.toFixed(2)} л/100 км`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          maxTicksLimit: 7,
          font: { size: 10 }
        }
      },
      y: {
        grid: {
          color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
        },
        ticks: {
          color: isDark ? '#94a3b8' : '#64748b',
          callback: (val) => `${val} л`
        }
      }
    }
  };

  consumptionLineChart = new ChartJS(consumptionLineCanvas.value, {
    type: 'line',
    data: chartData,
    options: chartOptions
  });
}

let chartRenderFrame: number | null = null;

function renderAllCharts() {
  nextTick(() => {
    if (chartRenderFrame !== null) {
      cancelAnimationFrame(chartRenderFrame);
    }
    chartRenderFrame = requestAnimationFrame(() => {
      chartRenderFrame = requestAnimationFrame(() => {
        chartRenderFrame = null;
        initDonutChart();
        initBarChart();
        initPriceLineChart();
        initConsumptionLineChart();
      });
    });
  });
}

// Watchers
watch(
  [
    selectedYear,
    showDiscounts,
    selectedFuelType,
    consumptionViewMode,
    isDarkTheme,
    () => activeCar.value?.id,
    activeRefuelings,
    activeParts,
    activeServiceEvents,
    activeMiscExpenses,
    activeInsurances
  ],
  () => {
    renderAllCharts();
  }
);

onMounted(() => {
  renderAllCharts();
});

onUnmounted(() => {
  if (chartRenderFrame !== null) {
    cancelAnimationFrame(chartRenderFrame);
  }
  if (donutChart) donutChart.destroy();
  if (barChart) barChart.destroy();
  if (priceLineChart) priceLineChart.destroy();
  if (consumptionLineChart) consumptionLineChart.destroy();
});
</script>

<template>
  <div class="space-y-6 pb-6">
    <!-- Top Header & Period Selector -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
          Аналитика
        </h2>
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {{ activeCar?.name }}
        </span>
      </div>

      <!-- Horizontal Period Chips -->
      <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 -mx-4 px-4">
        <button
          @click="selectedYear = 'all'"
          type="button"
          class="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95"
          :class="selectedYear === 'all'
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'"
        >
          За всё время
        </button>

        <button
          v-for="y in availableYears"
          :key="y"
          @click="selectedYear = y"
          type="button"
          class="px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition active:scale-95"
          :class="selectedYear === y
            ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'"
        >
          {{ y }}
        </button>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- CHART 1: Structure of Expenses (Donut)     -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Структура расходов на содержание
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {{ selectedYear === 'all' ? 'За весь период владения' : `За ${selectedYear} год` }} (без покупки авто)
          </p>
        </div>
      </div>

      <!-- Donut Canvas with Centered Text Overlay -->
      <div class="relative h-64 w-full flex items-center justify-center my-2">
        <canvas ref="donutCanvas" class="block h-full w-full"></canvas>
        <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
          <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Всего
          </span>
          <span class="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 font-mono tracking-tight">
            {{ formatCurrency(periodFilteredData.maintenanceTotal) }}
          </span>
          <span class="text-xs font-semibold text-blue-600 dark:text-blue-400 font-mono mt-0.5">
            {{ periodFilteredData.costPerKm.toFixed(2) }} ₽/км
          </span>
        </div>
      </div>

      <!-- Legend with 4 Categories -->
      <div class="mt-4 space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
        <!-- 1. Fuel -->
        <div
          @click="navigateTo('refuelings')"
          class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-blue-600 shrink-0"></div>
            <div class="flex items-center gap-1.5">
              <Fuel class="w-3.5 h-3.5 text-blue-600" />
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Топливо (Бензин)
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodFilteredData.fuelCost) }}
            </span>
            <span class="text-[11px] font-mono text-slate-400 w-10 text-right">
              {{ Math.round(periodFilteredData.fuelPercent) }}%
            </span>
            <span class="text-[11px] font-mono text-blue-600 dark:text-blue-400 w-16 text-right">
              {{ periodFilteredData.fuelPerKm.toFixed(2) }} ₽/км
            </span>
          </div>
        </div>

        <!-- 2. Parts -->
        <div
          @click="navigateTo('parts_tires')"
          class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-amber-500 shrink-0"></div>
            <div class="flex items-center gap-1.5">
              <Package class="w-3.5 h-3.5 text-amber-500" />
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Запчасти и расходники
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodFilteredData.partsCost) }}
            </span>
            <span class="text-[11px] font-mono text-slate-400 w-10 text-right">
              {{ Math.round(periodFilteredData.partsPercent) }}%
            </span>
            <span class="text-[11px] font-mono text-amber-600 dark:text-amber-400 w-16 text-right">
              {{ periodFilteredData.partsPerKm.toFixed(2) }} ₽/км
            </span>
          </div>
        </div>

        <!-- 3. Service -->
        <div
          @click="navigateTo('maintenance')"
          class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></div>
            <div class="flex items-center gap-1.5">
              <Wrench class="w-3.5 h-3.5 text-emerald-500" />
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Сервис и ремонт
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodFilteredData.serviceCost) }}
            </span>
            <span class="text-[11px] font-mono text-slate-400 w-10 text-right">
              {{ Math.round(periodFilteredData.servicePercent) }}%
            </span>
            <span class="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 w-16 text-right">
              {{ periodFilteredData.servicePerKm.toFixed(2) }} ₽/км
            </span>
          </div>
        </div>

        <!-- 4. Misc -->
        <div
          class="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
        >
          <div class="flex items-center gap-2.5">
            <div class="w-3 h-3 rounded-full bg-purple-500 shrink-0"></div>
            <div class="flex items-center gap-1.5">
              <Receipt class="w-3.5 h-3.5 text-purple-500" />
              <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Прочие траты (уход, ОСАГО, налоги)
              </span>
            </div>
          </div>
          <div class="flex items-center gap-2 text-right">
            <span class="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
              {{ formatCurrency(periodFilteredData.miscCost) }}
            </span>
            <span class="text-[11px] font-mono text-slate-400 w-10 text-right">
              {{ Math.round(periodFilteredData.miscPercent) }}%
            </span>
            <span class="text-[11px] font-mono text-purple-600 dark:text-purple-400 w-16 text-right">
              {{ periodFilteredData.miscPerKm.toFixed(2) }} ₽/км
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- CHART 2: Mileage by Year (Bar + Table)     -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Пробег по годам
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Среднегодовой пробег: ~{{ formatKm(averageAnnualMileage) }}
          </p>
        </div>
      </div>

      <!-- Bar Canvas -->
      <div class="h-64 w-full relative my-1">
        <canvas ref="barCanvas" class="block h-full w-full"></canvas>
      </div>

      <!-- Expandable Breakdown Table -->
      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
        <button
          @click="isTableExpanded = !isTableExpanded"
          type="button"
          class="w-full flex items-center justify-between text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline py-1"
        >
          <div class="flex items-center gap-1.5">
            <Calendar class="w-4 h-4" />
            <span>Детализация по годам</span>
          </div>
          <component :is="isTableExpanded ? ChevronUp : ChevronDown" class="w-4 h-4" />
        </button>

        <div v-show="isTableExpanded" class="mt-3 overflow-x-auto no-scrollbar">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 font-bold uppercase">
                <th class="py-2 pr-2">Год</th>
                <th class="py-2 px-2 text-right">Пробег</th>
                <th class="py-2 px-2 text-right">Ср. мес</th>
                <th class="py-2 px-2 text-right">Залито</th>
                <th class="py-2 px-2 text-right">Расходы</th>
                <th class="py-2 pl-2 text-right">₽/км</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              <tr
                v-for="row in annualStatsList"
                :key="row.year"
                class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                :class="selectedYear === row.year ? 'bg-blue-50/50 dark:bg-blue-950/20 font-bold' : ''"
              >
                <td class="py-2.5 pr-2 font-bold text-slate-800 dark:text-slate-200">
                  {{ row.year }}
                </td>
                <td class="py-2.5 px-2 text-right text-slate-900 dark:text-slate-100">
                  {{ row.mileage.toLocaleString('ru-RU') }} км
                </td>
                <td class="py-2.5 px-2 text-right text-slate-500 dark:text-slate-400">
                  {{ row.monthlyAvgKm.toLocaleString('ru-RU') }} км
                </td>
                <td class="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">
                  {{ Math.round(row.liters) }} л
                </td>
                <td class="py-2.5 px-2 text-right text-slate-900 dark:text-slate-100">
                  {{ formatCurrency(row.maintenanceCost) }}
                </td>
                <td class="py-2.5 pl-2 text-right font-bold text-blue-600 dark:text-blue-400">
                  {{ row.costPerKm.toFixed(2) }} ₽
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- CHART 3: Fuel Station Price Dynamics (Line)-->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            Динамика цены бензина по стеле
          </h3>
          <!-- Mini summary stats -->
          <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>Мин: <b class="text-slate-700 dark:text-slate-300">{{ fuelPriceStats.min.toFixed(2) }} ₽</b></span>
            <span>•</span>
            <span>Текущая: <b class="text-slate-700 dark:text-slate-300">{{ fuelPriceStats.current.toFixed(2) }} ₽</b></span>
            <span>•</span>
            <span class="text-red-500 font-bold flex items-center">
              <TrendingUp class="w-3 h-3 mr-0.5" />
              +{{ fuelPriceStats.growthPct }}%
            </span>
          </div>
        </div>

        <!-- Controls: Fuel type filter + discounts toggle -->
        <div class="flex items-center gap-2 self-start sm:self-auto">
          <!-- Discount Toggle Checkbox -->
          <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 font-semibold cursor-pointer select-none bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-xl">
            <input
              type="checkbox"
              v-model="showDiscounts"
              class="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <Sparkles class="w-3.5 h-3.5 text-emerald-500" />
            <span>Точки скидок</span>
          </label>
        </div>
      </div>

      <!-- Fuel Type Selector Chips (if > 1) -->
      <div v-if="availableFuelTypes.length > 1" class="flex items-center gap-1.5 mb-2 overflow-x-auto no-scrollbar">
        <button
          @click="selectedFuelType = 'all'"
          type="button"
          class="px-2 py-0.5 text-[11px] font-bold rounded-lg transition"
          :class="selectedFuelType === 'all'
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          Все марки
        </button>
        <button
          v-for="ft in availableFuelTypes"
          :key="ft"
          @click="selectedFuelType = ft"
          type="button"
          class="px-2 py-0.5 text-[11px] font-bold rounded-lg transition"
          :class="selectedFuelType === ft
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          {{ ft }}
        </button>
      </div>

      <!-- Line Canvas -->
      <div class="h-60 w-full relative my-1">
        <canvas ref="priceLineCanvas" class="block h-full w-full"></canvas>
      </div>
    </div>

    <!-- ========================================== -->
    <!-- CHART 4: Fuel Consumption Chart (Line)     -->
    <!-- ========================================== -->
    <div class="bg-white dark:bg-slate-900 rounded-3xl p-5 shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div>
          <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base">
            График расхода топлива (л/100 км)
          </h3>
          <!-- Mini summary stats -->
          <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span>Средний: <b class="text-blue-600 dark:text-blue-400">{{ fuelConsumptionStats.avg.toFixed(2) }} л</b></span>
            <span>•</span>
            <span>Мин: <b class="text-emerald-600 dark:text-emerald-400">{{ fuelConsumptionStats.min.toFixed(2) }} л</b></span>
            <span>•</span>
            <span>Макс: <b class="text-amber-600 dark:text-amber-400">{{ fuelConsumptionStats.max.toFixed(2) }} л</b></span>
          </div>
        </div>

        <!-- Mode switcher: by refuel vs monthly average -->
        <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl self-start sm:self-auto text-xs font-semibold">
          <button
            @click="consumptionViewMode = 'refuels'"
            type="button"
            class="px-2.5 py-1 rounded-lg transition"
            :class="consumptionViewMode === 'refuels'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-bold'
              : 'text-slate-500 dark:text-slate-400'"
          >
            По заправкам
          </button>
          <button
            @click="consumptionViewMode = 'monthly'"
            type="button"
            class="px-2.5 py-1 rounded-lg transition"
            :class="consumptionViewMode === 'monthly'
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm font-bold'
              : 'text-slate-500 dark:text-slate-400'"
          >
            По месяцам
          </button>
        </div>
      </div>

      <!-- Line Canvas -->
      <div class="h-60 w-full relative my-1">
        <canvas ref="consumptionLineCanvas" class="block h-full w-full"></canvas>
      </div>
    </div>
  </div>
</template>

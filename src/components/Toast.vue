<script setup lang="ts">
import { toast } from '../services/store';
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 translate-y-3 scale-95"
    enter-to-class="opacity-100 translate-y-0 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 translate-y-0 scale-100"
    leave-to-class="opacity-0 translate-y-3 scale-95"
  >
    <div
      v-if="toast.visible"
      class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90%] pointer-events-none"
    >
      <div
        class="bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-sm font-medium px-4 py-3 rounded-2xl shadow-xl backdrop-blur text-center border border-slate-700/50 dark:border-slate-300/50"
      >
        {{ toast.message }}
      </div>
    </div>
  </Transition>
</template>

import { createApp } from 'vue';
import './style.css';
import App from './App.vue';

// Защита от удаления базы браузером на Android (AGENTS.md)
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then((persistent) => {
    console.log(`[Storage] Persistent storage granted: ${persistent}`);
  }).catch((err) => {
    console.warn('[Storage] Could not request persistence:', err);
  });
}

createApp(App).mount('#app');

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

/**
 * Отпечаток сборки. Нужен для разбора жалоб вида «у меня белый экран»:
 * без него невозможно отличить настоящую ошибку от старой сборки,
 * которую телефон достал из кеша. Версия пишется в консоль при старте
 * и доступна как window.__APP_BUILD.
 */
function buildStamp(): string {
    let commit = 'dev';
    try {
        commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
        // Не в репозитории — не повод падать при сборке.
    }
    return `${commit} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
})

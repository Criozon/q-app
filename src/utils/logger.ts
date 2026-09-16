// Проверяем, запущено ли приложение в режиме разработки.
// Vite автоматически устанавливает эту переменную.
const isDev = import.meta.env.DEV;

/**
 * Простой логгер, который работает только в режиме разработки.
 */
function log(source: string, message: string, data?: unknown) {
  if (isDev) {
    const logMessage = `%c[${source}]%c ${message}`;
    const sourceStyle = 'color: #007aff; font-weight: bold;';
    const messageStyle = 'color: #1d1d1f;';

    if (data !== undefined) {
      console.log(logMessage, sourceStyle, messageStyle, data);
    } else {
      console.log(logMessage, sourceStyle, messageStyle);
    }
  }
}

export default log;
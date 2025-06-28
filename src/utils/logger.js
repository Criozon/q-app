// Проверяем, запущено ли приложение в режиме разработки.
// Vite автоматически устанавливает эту переменную.
const isDev = import.meta.env.DEV;

/**
 * Простой логгер, который работает только в режиме разработки.
 * @param {string} source - Источник сообщения (например, 'AdminPage').
 * @param {string} message - Сообщение для лога.
 * @param {any} [data] - Опциональные данные для вывода.
 */
function log(source, message, data) {
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
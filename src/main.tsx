import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// --- ВОТ ОН, ГЛАВНЫЙ РУБИЛЬНИК! ---
// Эта строка подключает все наши глобальные стили, цвета и классы.
// Убедитесь, что она на месте и не закомментирована.
import './index.css'

// Печатаем версию сборки всегда, в том числе в продакшене: по жалобе
// «белый экран» это первое, что нужно знать — своя ли ошибка или телефон
// показывает старую сборку из кеша.
console.info(`Q-App · сборка ${__APP_BUILD__}`);
(window as unknown as { __APP_BUILD: string }).__APP_BUILD = __APP_BUILD__;


const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден корневой элемент #root');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
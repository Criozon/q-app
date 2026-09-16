import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// --- ВОТ ОН, ГЛАВНЫЙ РУБИЛЬНИК! ---
// Эта строка подключает все наши глобальные стили, цвета и классы.
// Убедитесь, что она на месте и не закомментирована.
import './index.css' 

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден корневой элемент #root');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
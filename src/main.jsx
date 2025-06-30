import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// --- ВОТ ОН, ГЛАВНЫЙ РУБИЛЬНИК! ---
// Эта строка подключает все наши глобальные стили, цвета и классы.
// Убедитесь, что она на месте и не закомментирована.
import './index.css' 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
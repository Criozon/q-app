import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import JoinPage from './pages/JoinPage';
import WaitPage from './pages/WaitPage';
import PrintPage from './pages/PrintPage';
import WindowAdminPage from './pages/WindowAdminPage'; // НОВЫЙ ИМПОРТ

import { QueueProvider } from './context/QueueContext';
import { WindowAdminProvider } from './context/WindowAdminContext'; // НОВЫЙ ИМПОРТ

import './App.css'; 

function App() {
  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />

      <Router>
        <Routes>
          {/* Маршруты для клиента */}
          <Route path="/" element={<HomePage />} />
          <Route path="/join/:queueId" element={<JoinPage />} />
          <Route path="/wait/:queueId/:memberId" element={<WaitPage />} />
          <Route path="/print/:queueId" element={<PrintPage />} />
          
          {/* Маршрут для Мастер-Администратора */}
          <Route 
            path="/admin/:secretKey" 
            element={
              <QueueProvider>
                <AdminPage />
              </QueueProvider>
            } 
          />

          {/* НОВЫЙ МАРШРУТ для Администратора Окна */}
          <Route
            path="/window-admin/:windowSecretKey"
            element={
              <WindowAdminProvider>
                <WindowAdminPage />
              </WindowAdminProvider>
            }
          />
        </Routes>
      </Router>
    </>
  );
}

export default App;
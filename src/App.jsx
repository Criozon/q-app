import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import JoinPage from './pages/JoinPage';
import WaitPage from './pages/WaitPage';
import PrintPage from './pages/PrintPage';
import { QueueProvider } from './context/QueueContext'; // 1. Импортируем провайдер

import './App.css'; 

function App() {
  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />

      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* 2. Оборачиваем AdminPage в QueueProvider */}
          <Route 
            path="/admin/:secretKey" 
            element={
              <QueueProvider>
                <AdminPage />
              </QueueProvider>
            } 
          />
          <Route path="/join/:queueId" element={<JoinPage />} />
          <Route path="/wait/:queueId/:memberId" element={<WaitPage />} />
          <Route path="/print/:queueId" element={<PrintPage />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
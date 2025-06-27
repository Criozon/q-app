import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // <-- ИМПОРТИРУЕМ КОМПОНЕНТ

import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import JoinPage from './pages/JoinPage';
import WaitPage from './pages/WaitPage';
import PrintPage from './pages/PrintPage';

import './App.css'; 

function App() {
  return (
    <> {/* Оборачиваем все в "фрагмент" */}
      {/* Этот компонент будет показывать все наши уведомления */}
      <Toaster position="top-center" reverseOrder={false} />

      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/:secretKey" element={<AdminPage />} />
          <Route path="/join/:queueId" element={<JoinPage />} />
          <Route path="/wait/:queueId/:memberName" element={<WaitPage />} />
          <Route path="/print/:queueId" element={<PrintPage />} />
        </Routes>
      </Router>
    </>
  );
}

export default App;
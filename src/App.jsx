import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast'; // <-- ИМПОРТ

import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import JoinPage from './pages/JoinPage';
import WaitPage from './pages/WaitPage';
import PrintPage from './pages/PrintPage'; // Мы пока не создали эту страницу, но маршрут оставим

function App() {
  return (
    <>
      <Toaster position="top-center" />
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/admin/:secretKey" element={<AdminPage />} />
          <Route path="/join/:queueId" element={<JoinPage />} />
          <Route path="/wait/:queueId/:memberName" element={<WaitPage />} />
          {/* <Route path="/print/:queueId" element={<PrintPage />} /> */}
        </Routes>
      </Router>
    </>
  );
}

export default App;
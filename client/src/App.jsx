import { Route, Routes } from 'react-router-dom';
import { ConnectionBanner, FloatingEmojis, FullPageMessage, ToastProvider } from './components/ui.jsx';
import AdminBoardPage from './pages/AdminBoardPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import CapturePage from './pages/CapturePage.jsx';
import HomePage from './pages/HomePage.jsx';
import JoinPage from './pages/JoinPage.jsx';
import PlayPage from './pages/PlayPage.jsx';

export default function App() {
  return (
    <ToastProvider>
      <FloatingEmojis />
      <ConnectionBanner />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/:gameId" element={<AdminPage />} />
        <Route path="/admin/:gameId/board" element={<AdminBoardPage />} />
        <Route path="/board/:gameId" element={<BoardPage />} />
        <Route path="/join/:gameId" element={<JoinPage />} />
        <Route path="/play/:gameId" element={<PlayPage />} />
        <Route path="/c/:gameId/:code" element={<CapturePage />} />
        <Route path="*" element={<FullPageMessage emoji="🕳️" title="Nothing to steal here">
          <a className="btn btn-primary" href="/">Go home</a>
        </FullPageMessage>} />
      </Routes>
    </ToastProvider>
  );
}

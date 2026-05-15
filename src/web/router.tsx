import { Navigate, Route, Routes } from 'react-router-dom';
import { DiagramPage } from './pages/DiagramPage';
import { IndexPage } from './pages/IndexPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<IndexPage />} />
      <Route path="/d/:id" element={<DiagramPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export const NavigateToRoot = () => <Navigate to="/" replace />;

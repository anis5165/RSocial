import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../hooks/useAuth';
import { DashboardLayout } from '../layouts/DashboardLayout';
import { LoginPage } from '../pages/LoginPage';
import { RegisterPage } from '../pages/RegisterPage';
import { OverviewPage } from '../pages/OverviewPage';
import { QueuePage } from '../pages/QueuePage';
import { MediaPage } from '../pages/MediaPage';
import { AccountsPage } from '../pages/AccountsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { ComposerPage } from '../pages/ComposerPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/composer" element={<ComposerPage />} />
            <Route path="/media" element={<MediaPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

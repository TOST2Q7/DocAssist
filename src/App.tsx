import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { WorkspaceProvider } from '@/core/workspace/WorkspaceContext';
import { AboutPage } from '@/pages/AboutPage';
import { BasePage } from '@/pages/BasePage';
import { FaqPage } from '@/pages/FaqPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OutboxPage } from '@/pages/OutboxPage';
import { VariablesPage } from '@/pages/VariablesPage';
import { WorkspacePage } from '@/pages/WorkspacePage';
import { AppHost } from '@/ui/AppHost';
import { Layout } from '@/ui/Layout';
import { ToastProvider } from '@/ui/Toast';

// HashRouter: адреса вида /#/apps/anketa работают на любом хостинге (GitHub Pages) и офлайн.
const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/apps/:appId/*', element: <AppHost /> },
      { path: '/workspace', element: <WorkspacePage /> },
      { path: '/variables', element: <VariablesPage /> },
      { path: '/base', element: <BasePage /> },
      { path: '/dictionaries', element: <Navigate to="/base" replace /> },
      { path: '/outbox', element: <OutboxPage /> },
      { path: '/faq', element: <FaqPage /> },
      { path: '/about', element: <AboutPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <WorkspaceProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </WorkspaceProvider>
  );
}

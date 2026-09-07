import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { MobileShell } from '@/components/layout/mobile-shell'
import { RequireAuth } from '@/components/auth/require-auth'
import { AuthProvider } from '@/providers/auth-provider'
import { ThemeProvider } from '@/providers/theme-provider'
import { HomePage } from '@/routes/home'
import { TrendsPage } from '@/routes/trends'
import { AuthCallbackPage } from '@/routes/auth-callback'
import { NotFoundPage } from '@/routes/not-found'

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<MobileShell />}>
              <Route index element={<HomePage />} />
              <Route
                path="trends"
                element={
                  <RequireAuth>
                    <TrendsPage />
                  </RequireAuth>
                }
              />
              <Route path="auth/callback" element={<AuthCallbackPage />} />
              {import.meta.env.DEV && (
                <>
                  <Route path="demo" element={<HomePage demo />} />
                  <Route path="demo/trends" element={<TrendsPage demo />} />
                </>
              )}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';
import ReportLost from './pages/ReportLost';
import ReportFound from './pages/ReportFound';
import TrackStatus from './pages/TrackStatus';
import Admin from './pages/Admin';
import Archived from './pages/Archived';
import { ToastProvider } from './components/Toast';
import { AuthProvider } from './components/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <div className="app-layout">
            <Header />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/lost" element={<ReportLost />} />
                <Route path="/found" element={<ReportFound />} />
                <Route path="/status" element={<TrackStatus />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/archive" element={<Archived />} />
              </Routes>
            </main>
            <footer className="footer py-4 mt-5 bg-white border-top text-center text-muted small">
              <div className="container">
                <p className="mb-1">Safe Recover &bull; Secure, Confidential Lost &amp; Found Portal</p>
                <p className="mb-0">Automated Smart Matching &bull; Verified Physical Handover</p>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

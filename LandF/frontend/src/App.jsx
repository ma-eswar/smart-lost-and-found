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

export default function App() {
  return (
    <ToastProvider>
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
            <p className="mb-1">AegisRecover &bull; Secure, Confidential Lost &amp; Found Protocol</p>
            <p className="mb-0">Powered by FastAPI, React, and OpenStreetMap Geo-Services.</p>
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}

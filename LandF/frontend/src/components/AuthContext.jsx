import React, { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from './Toast';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('auth_token') || '');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const logout = () => {
    setUser(null);
    setToken('');
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    toast.info('You have logged out.');
  };

  const setAuthSession = (userData, userToken) => {
    if (userData) {
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
      if (userData.phone) {
        localStorage.setItem('last_user_phone', userData.phone);
      }
    }
    if (userToken) {
      setToken(userToken);
      localStorage.setItem('auth_token', userToken);
    }
  };

  const loginWithOtp = async (phone, otp) => {
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, otp);
      setAuthSession(res.user, res.access_token);
      setShowLoginModal(false);
      toast.success(`Welcome, ${res.user.full_name || 'User'}!`);
      return res.user;
    } catch (err) {
      toast.error(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoggedIn: !!user,
        logout,
        setAuthSession,
        loginWithOtp,
        showLoginModal,
        setShowLoginModal,
        loading
      }}
    >
      {children}
      {showLoginModal && (
        <LoginModal
          onClose={() => setShowLoginModal(false)}
          onVerifyOtp={loginWithOtp}
          loading={loading}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

function LoginModal({ onClose, onVerifyOtp, loading }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'not_found'
  const [phone, setPhone] = useState(() => localStorage.getItem('last_user_phone') || '');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [userName, setUserName] = useState('');

  const handlePhoneSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      toast.error('Please enter your mobile phone number.');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.requestOtp(phone.trim());
      if (!res.exists) {
        setStep('not_found');
      } else {
        setUserName(res.user_name || 'User');
        setOtp('123456'); // Pre-fill test OTP for instantaneous convenience
        setStep('otp');
        toast.info(res.message || 'OTP sent successfully!');
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setVerifying(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      toast.error('Please enter the 6-digit verification code.');
      return;
    }
    try {
      await onVerifyOtp(phone.trim(), otp.trim());
    } catch {
      // Toast handles error
    }
  };

  const handleReportLost = () => {
    onClose();
    navigate('/lost');
  };

  const handleReportFound = () => {
    onClose();
    navigate('/found');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="form-card" style={{ maxWidth: '440px', width: '100%', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="bi bi-shield-lock" style={{ color: 'var(--color-primary)' }}></i>
            {step === 'otp' ? 'Enter Verification Code' : (step === 'not_found' ? 'Account Notice' : 'User Sign In')}
          </h3>
          <button type="button" className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        {/* STEP 1: PHONE NUMBER INPUT */}
        {step === 'phone' && (
          <div>
            <p className="field-hint" style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
              Sign in with your registered mobile phone number to automatically access your Lost and Found dashboard.
            </p>

            <form onSubmit={handlePhoneSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600 }}>Mobile Phone Number *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    className="form-control"
                    placeholder="e.g. 9392457668 or +91 93924 57668"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <span className="field-hint" style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
                  Supports 10-digit number or with +91 country code.
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', height: '46px', fontWeight: 600 }}
                disabled={verifying}
              >
                {verifying ? (
                  <><i className="bi bi-hourglass-split"></i> Verifying Number...</>
                ) : (
                  <><i className="bi bi-arrow-right-circle"></i> Continue with OTP</>
                )}
              </button>
            </form>
          </div>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 'otp' && (
          <div>
            <p className="field-hint" style={{ marginBottom: '1.25rem', color: 'var(--text-secondary)' }}>
              Welcome back <strong>{userName}</strong>! Enter the 6-digit verification code sent to <strong>{phone}</strong>.
            </p>

            <form onSubmit={handleOtpSubmit}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: 600 }}>6-Digit OTP Code *</label>
                <input
                  type="text"
                  maxLength={6}
                  className="form-control text-center"
                  style={{ fontSize: '1.4rem', letterSpacing: '0.3rem', fontWeight: 700 }}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  required
                  autoFocus
                />
                <span className="field-hint" style={{ fontSize: '0.78rem', marginTop: '0.35rem', color: 'var(--color-emerald)' }}>
                  <i className="bi bi-info-circle"></i> Test OTP code is <strong>123456</strong>
                </span>
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', height: '46px', fontWeight: 600, marginBottom: '0.75rem' }}
                disabled={loading}
              >
                {loading ? (
                  <><i className="bi bi-hourglass-split"></i> Verifying &amp; Loading Dashboard...</>
                ) : (
                  <><i className="bi bi-check2-circle"></i> Verify &amp; Sign In</>
                )}
              </button>

              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ width: '100%' }}
                onClick={() => setStep('phone')}
              >
                <i className="bi bi-arrow-left"></i> Change Phone Number
              </button>
            </form>
          </div>
        )}

        {/* STEP 3: UNREGISTERED PHONE NOTICE */}
        {step === 'not_found' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', fontSize: '1.75rem' }}>
              <i className="bi bi-exclamation-circle-fill"></i>
            </div>

            <h4 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              No Registered Listings Found
            </h4>

            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              You can only create an account when you submit a <strong>Lost</strong> or <strong>Found</strong> product report. Your account and dashboard will be generated automatically upon submission!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleReportLost}
                style={{ width: '100%', height: '44px', fontWeight: 600 }}
              >
                <i className="bi bi-search"></i> Report a Lost Item
              </button>
              
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleReportFound}
                style={{ width: '100%', height: '44px', fontWeight: 600 }}
              >
                <i className="bi bi-box-seam"></i> Report a Found Item
              </button>
            </div>

            <button
              type="button"
              className="btn-text-sm"
              onClick={() => setStep('phone')}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              Try another phone number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

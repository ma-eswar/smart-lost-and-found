import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function translateError(error) {
  if (!error) return 'An unexpected issue occurred. Please try again.';
  
  const msg = typeof error === 'string' ? error : (error.detail || error.message || error.toString());
  const lower = msg.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('econnrefused')) {
    return 'Could not connect to the server. Please ensure the backend is running and check your network.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('invalid admin pin') || lower.includes('invalid credentials')) {
    return 'Authentication failed. Please verify your PIN or login credentials.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'No matching records were found for this query.';
  }
  if (lower.includes('already exists') || lower.includes('unique constraint')) {
    return 'A record with this phone number or details is already registered.';
  }
  if (lower.includes('500') || lower.includes('internal server')) {
    return 'Server encountered an unexpected error. Please try again shortly.';
  }
  
  return msg;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    const newToast = { id, message, type };
    
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4200);
  }, [removeToast]);

  const success = useCallback((msg) => addToast(msg, 'success'), [addToast]);
  const info = useCallback((msg) => addToast(msg, 'info'), [addToast]);
  const error = useCallback((err) => addToast(translateError(err), 'error'), [addToast]);

  return (
    <ToastContext.Provider value={{ showToast: addToast, success, info, error }}>
      {children}
      {/* Toast Container Stack */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card toast-${t.type} slide-in-toast`}>
            <div className="toast-icon">
              {t.type === 'success' && <i className="bi bi-check-circle-fill"></i>}
              {t.type === 'error' && <i className="bi bi-exclamation-octagon-fill"></i>}
              {t.type === 'info' && <i className="bi bi-info-circle-fill"></i>}
            </div>
            <div className="toast-message">{t.message}</div>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
            >
              <i className="bi bi-x"></i>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

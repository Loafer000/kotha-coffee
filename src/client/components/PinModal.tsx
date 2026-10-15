import React, { useState } from 'react';
import { Lock, Delete, ArrowRight, X } from 'lucide-react';
import { verifyPin, setStoredToken } from '../services/api.js';

interface PinModalProps {
  isOpen: boolean;
  onSuccess: (token: string) => void;
  onCancel?: () => void;
  title?: string;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onSuccess,
  onCancel,
  title = "Reception PIN Required"
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  if (!isOpen) return null;

  const triggerShake = (msg: string) => {
    setError(msg);
    setShake(true);
    setPin('');
    setTimeout(() => setShake(false), 500);
  };

  const handleDigit = (digit: string) => {
    if (loading) return;
    if (error) setError(null);
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      // Auto-submit if 4 digits entered
      if (nextPin.length === 4) {
        submitPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (loading) return;
    if (error) setError(null);
    setPin(prev => prev.slice(0, -1));
  };

  const submitPin = async (candidatePin: string) => {
    if (!candidatePin) return;
    setLoading(true);
    setError(null);
    try {
      const res = await verifyPin(candidatePin);
      if (res && res.token) {
        setStoredToken(res.token);
        onSuccess(res.token);
      } else {
        triggerShake('Invalid PIN');
      }
    } catch (err: any) {
      triggerShake(err.message || 'Incorrect PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    submitPin(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div 
        className={`w-full max-w-[340px] bg-[#FAF3E0] rounded-2xl p-6 shadow-2xl border-2 border-[#8D493A]/30 text-center relative ${
          shake ? 'animate-shake' : ''
        }`}
      >
        {onCancel && (
          <button
            onClick={onCancel}
            className="absolute top-3 right-3 text-[#5D4037] hover:text-[#3E2723] p-1.5 rounded-full hover:bg-[#EADCC8] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Lock Icon */}
        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#3E2723] text-[#FFF8E7] flex items-center justify-center shadow-md">
          <Lock className="w-7 h-7" />
        </div>

        <h3 className="text-xl font-bold text-[#3E2723] mb-1">{title}</h3>
        <p className="text-xs text-[#5D4037] mb-4">
          Enter 4-digit staff PIN to unlock reception controls
        </p>

        {/* Form with hidden/visible input for Playwright & screen readers */}
        <form onSubmit={handleSubmit} className="mb-4">
          <input
            type="password"
            data-testid="pin-input"
            value={pin}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
              setPin(val);
              if (val.length === 4) submitPin(val);
            }}
            placeholder="Enter PIN"
            maxLength={6}
            autoFocus
            className="w-full text-center text-2xl tracking-widest py-2 px-3 border-2 border-[#8D493A]/40 rounded-xl bg-white text-[#3E2723] font-mono focus:outline-none focus:border-[#3E2723] mb-3"
          />

          {/* Visual PIN dots */}
          <div className="flex justify-center space-x-3 mb-2">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pin.length > idx
                    ? 'bg-[#3E2723] border-[#3E2723] scale-110'
                    : 'border-[#8D6E63] bg-transparent'
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs font-semibold text-rose-700 mt-2 mb-1 animate-pulse">
              {error}
            </p>
          )}

          {/* Touch-Friendly Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 mt-4 max-w-[260px] mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigit(digit)}
                className="min-h-[50px] min-w-[50px] rounded-xl bg-white text-[#3E2723] font-bold text-xl shadow-sm hover:bg-[#FFF8E7] active:bg-[#EADCC8] active:scale-95 transition-all flex items-center justify-center border border-[#D7CCC8]"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="min-h-[50px] min-w-[50px] rounded-xl bg-[#EFEBE9] text-[#5D4037] font-semibold text-sm shadow-sm hover:bg-[#D7CCC8] active:scale-95 transition-all flex items-center justify-center border border-[#D7CCC8]"
            >
              <Delete className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="min-h-[50px] min-w-[50px] rounded-xl bg-white text-[#3E2723] font-bold text-xl shadow-sm hover:bg-[#FFF8E7] active:bg-[#EADCC8] active:scale-95 transition-all flex items-center justify-center border border-[#D7CCC8]"
            >
              0
            </button>
            <button
              type="submit"
              data-testid="pin-submit"
              disabled={loading || pin.length < 4}
              className="min-h-[50px] min-w-[50px] rounded-xl bg-[#3E2723] text-[#FFF8E7] font-bold text-sm shadow-sm hover:bg-[#4E342E] active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <button
            type="submit"
            data-testid="btn-unlock"
            disabled={loading || pin.length < 4}
            className="w-full mt-4 min-h-[44px] py-2.5 px-4 bg-[#3E2723] text-[#FFF8E7] font-semibold rounded-xl hover:bg-[#4E342E] active:bg-[#2C1810] disabled:opacity-50 transition-colors shadow flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Verifying...' : 'Unlock Reception'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

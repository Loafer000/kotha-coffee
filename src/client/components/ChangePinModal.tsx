import React, { useState } from 'react';
import { KeyRound, X, Check, AlertCircle } from 'lucide-react';
import { changePin } from '../services/api.js';

interface ChangePinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ChangePinModal: React.FC<ChangePinModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!/^\d{4,6}$/.test(currentPin.trim())) {
      setError('Current PIN must be 4 to 6 digits');
      return;
    }
    if (!/^\d{4,6}$/.test(newPin.trim())) {
      setError('New PIN must be 4 to 6 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setError('New PIN and Confirm PIN do not match');
      return;
    }

    setLoading(true);
    try {
      const res = await changePin(currentPin.trim(), newPin.trim());
      setSuccess(res.message || 'PIN updated successfully!');
      setTimeout(() => {
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setSuccess(null);
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to update PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-[360px] bg-[#FAF3E0] rounded-2xl p-6 shadow-2xl border-2 border-[#8D493A]/30 relative text-[#3E2723]">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#5D4037] hover:text-[#3E2723] p-1.5 rounded-full hover:bg-[#EADCC8] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[#3E2723] text-[#FFF8E7] flex items-center justify-center shadow-md">
          <KeyRound className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-center mb-1">Change Reception PIN</h3>
        <p className="text-xs text-[#5D4037] text-center mb-4">
          Update the 4-6 digit staff PIN for reception access
        </p>

        {error && (
          <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center space-x-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-1.5">
            <Check className="w-4 h-4 flex-shrink-0 text-emerald-600" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#5D4037] mb-1">Current PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter current PIN"
              className="w-full px-3 py-2 border-2 border-[#8D493A]/30 rounded-xl bg-white text-[#3E2723] font-mono text-center tracking-widest text-lg focus:outline-none focus:border-[#3E2723]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5D4037] mb-1">New PIN (4-6 digits)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Enter new PIN"
              className="w-full px-3 py-2 border-2 border-[#8D493A]/30 rounded-xl bg-white text-[#3E2723] font-mono text-center tracking-widest text-lg focus:outline-none focus:border-[#3E2723]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5D4037] mb-1">Confirm New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="Confirm new PIN"
              className="w-full px-3 py-2 border-2 border-[#8D493A]/30 rounded-xl bg-white text-[#3E2723] font-mono text-center tracking-widest text-lg focus:outline-none focus:border-[#3E2723]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !currentPin || !newPin || !confirmPin}
            className="w-full mt-4 min-h-[44px] py-2.5 px-4 bg-[#3E2723] text-[#FFF8E7] font-semibold rounded-xl hover:bg-[#4E342E] active:bg-[#2C1810] disabled:opacity-50 transition-colors shadow flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Updating...' : 'Update PIN'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};

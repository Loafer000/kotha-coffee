import React from 'react';
import { PlusCircle, UtensilsCrossed, Coffee, Clock, ShieldCheck } from 'lucide-react';

interface LandingProps {
  onNavigate: (path: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ onNavigate }) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-5 space-y-6">
      
      {/* Brand Hero Card */}
      <div className="text-center pt-4 pb-2">
        <div className="w-24 h-24 mx-auto mb-4 rounded-3xl bg-white p-2 shadow-md border-2 border-[#8D493A]/20 flex items-center justify-center overflow-hidden">
          <img 
            src="/logo.jpeg" 
            alt="Kotha & Coffee" 
            className="w-full h-full object-cover rounded-2xl"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <Coffee className="w-12 h-12 text-[#3E2723]" />
        </div>

        <h1 className="text-3xl font-extrabold text-[#3E2723] tracking-tight">
          কথা <span className="text-[#8D493A] font-serif">&</span> Coffee
        </h1>
        <p className="text-xs text-[#5D4037] font-medium mt-1">
          — এক কাপ কফি, না বলা কিছু কথা —
        </p>

        <div className="mt-4 inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#EADCC8]/60 text-[#3E2723] text-[11px] font-semibold border border-[#D7CCC8]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Cafe POS Active • Asia/Kolkata</span>
        </div>
      </div>

      {/* Dual Access Tiles (R1) */}
      <div className="space-y-4 flex-1 flex flex-col justify-center">
        
        {/* Reception Action Card */}
        <button
          onClick={() => onNavigate('/reception')}
          data-testid="role-reception"
          className="w-full min-h-[110px] p-5 rounded-3xl bg-[#3E2723] text-[#FFF8E7] shadow-lg hover:bg-[#4E342E] active:scale-[0.98] transition-all text-left flex items-center justify-between group border border-[#2C1810]"
        >
          <div className="flex-1 pr-3">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xl font-bold text-[#FFF8E7]">Add Order</span>
              <span className="px-2 py-0.5 rounded-full bg-[#8D493A] text-[10px] font-semibold text-[#FFF8E7] tracking-wider uppercase">
                Reception
              </span>
            </div>
            <p className="text-xs text-[#FFF8E7]/80 leading-relaxed">
              Create numbered orders, manage pending tickets, menu catalog & daily sales
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FFF8E7]/10 flex items-center justify-center text-amber-200 group-hover:scale-105 transition-transform flex-shrink-0">
            <PlusCircle className="w-7 h-7" />
          </div>
        </button>

        {/* Kitchen Action Card */}
        <button
          onClick={() => onNavigate('/kitchen')}
          data-testid="role-kitchen"
          className="w-full min-h-[110px] p-5 rounded-3xl bg-white text-[#3E2723] shadow-md hover:bg-[#FFF8E7] active:scale-[0.98] transition-all text-left flex items-center justify-between group border-2 border-[#8D493A]/30"
        >
          <div className="flex-1 pr-3">
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-xl font-bold text-[#3E2723]">See Orders</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-[10px] font-semibold text-emerald-800 tracking-wider uppercase">
                Kitchen
              </span>
            </div>
            <p className="text-xs text-[#5D4037] leading-relaxed">
              Live hands-free kitchen board with sound chimes for incoming pending orders
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-[#FAF3E0] flex items-center justify-center text-[#3E2723] group-hover:scale-105 transition-transform flex-shrink-0">
            <UtensilsCrossed className="w-7 h-7" />
          </div>
        </button>

      </div>

      {/* Footer Info */}
      <div className="text-center pb-2 text-[11px] text-[#8D6E63] flex flex-col items-center space-y-1">
        <div className="flex items-center space-x-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Reception protected by PIN • Shift sessions cached 12h</span>
        </div>
        <p className="text-[10px] text-[#8D6E63]/70">
          Kotha & Coffee POS v1.0 • Good Food Good Vibes ♥
        </p>
      </div>

    </div>
  );
};

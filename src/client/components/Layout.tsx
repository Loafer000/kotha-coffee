import React from 'react';
import { Coffee, Home, Unlock, UtensilsCrossed } from 'lucide-react';
import { getStoredToken, clearStoredToken } from '../services/api.js';

interface LayoutProps {
  children: React.ReactNode;
  activePath: string;
  onNavigate: (path: string) => void;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  activePath,
  onNavigate,
  title,
  subtitle
}) => {
  const hasToken = typeof window !== 'undefined' && !!getStoredToken();

  const handleLogout = () => {
    clearStoredToken();
    onNavigate('/');
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF3E0] text-[#3E2723] overflow-x-hidden flex justify-center">
      {/* Mobile-constrained 375px-centered container */}
      <div className="w-full max-w-[420px] min-h-screen bg-[#FFFDF9] shadow-md flex flex-col overflow-x-hidden relative">
        
        {/* Brand Top Header */}
        <header className="sticky top-0 z-40 bg-[#3E2723] text-[#FFF8E7] px-4 py-3 shadow flex items-center justify-between border-b border-[#2C1810]">
          <div 
            onClick={() => onNavigate('/')}
            className="flex items-center space-x-2.5 cursor-pointer select-none active:opacity-80"
          >
            <div className="w-9 h-9 rounded-full bg-[#FAF3E0] p-1 flex items-center justify-center shadow-inner overflow-hidden flex-shrink-0">
              <img 
                src="/logo.jpeg" 
                alt="Logo" 
                className="w-full h-full object-cover rounded-full"
                onError={(e) => {
                  // Fallback to icon if image fails
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
              <Coffee className="w-5 h-5 text-[#3E2723]" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight leading-none text-[#FFF8E7]">
                কথা <span className="text-[#E6C687] font-serif">&</span> Coffee
              </h1>
              <p className="text-[10px] text-[#FAF3E0]/80 tracking-wide font-light truncate max-w-[200px]">
                এক কাপ কফি, না বলা কিছু কথা -
              </p>
            </div>
          </div>

          {/* Quick Navigation / Role Toggle */}
          <div className="flex items-center space-x-1.5">
            {activePath !== '/' && (
              <button
                onClick={() => onNavigate('/')}
                title="Home"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#FFF8E7] hover:bg-[#4E342E] active:bg-[#2C1810] transition-colors"
              >
                <Home className="w-5 h-5" />
              </button>
            )}

            {activePath.startsWith('/reception') && hasToken && (
              <button
                onClick={handleLogout}
                title="Lock Session"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-[#FFF8E7]/80 hover:text-amber-300 hover:bg-[#4E342E] active:bg-[#2C1810] transition-colors"
              >
                <Unlock className="w-4 h-4 text-emerald-400" />
              </button>
            )}

            {activePath === '/' && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => onNavigate('/kitchen')}
                  className="min-h-[44px] px-2.5 py-1 text-xs rounded bg-[#4E342E] text-[#FFF8E7] hover:bg-[#5D4037] flex items-center space-x-1"
                >
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                  <span>Kitchen</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Subheader if specified */}
        {(title || subtitle) && (
          <div className="bg-[#FAF3E0] px-4 py-2 border-b border-[#EADCC8] flex justify-between items-center">
            <div>
              {title && <h2 className="text-base font-bold text-[#3E2723]">{title}</h2>}
              {subtitle && <p className="text-xs text-[#5D4037]">{subtitle}</p>}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};

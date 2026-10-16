import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UtensilsCrossed, Bell, Clock, CheckCircle2, Volume2, Radio, Check } from 'lucide-react';
import { getKitchenOrders, toggleItemDelivery, type Order } from '../services/api.js';

export const Kitchen: React.FC = () => {
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [settledOrders, setSettledOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');
  const [audioEnabled, setAudioEnabled] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef<boolean>(false);

  /**
   * Plays synthetic dual-tone bell chime using Web Audio API (D5: 587.33Hz -> A5: 880Hz).
   * Also triggers window CustomEvent 'kitchen-sound-alert' and updates
   * document.body attribute 'data-kitchen-alert-count' for automated test observability.
   */
  const playKitchenChime = useCallback((orderNumber?: number) => {
    // 1. Dispatch observable test hooks
    try {
      const currentCount = parseInt(document.body.getAttribute('data-kitchen-alert-count') || '0', 10);
      document.body.setAttribute('data-kitchen-alert-count', String(currentCount + 1));
      window.dispatchEvent(
        new CustomEvent('kitchen-sound-alert', {
          detail: { orderNumber: orderNumber || 0 }
        })
      );
    } catch (_) {}

    // 2. Play acoustic dual-tone chime if AudioContext is running
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass();
      }
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;

      // Tone 1: 587.33 Hz (D5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.28, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Tone 2: 880.00 Hz (A5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.15);
      gain2.gain.setValueAtTime(0.32, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.75);
    } catch (err) {
      console.warn('Audio playback error:', err);
    }
  }, []);

  /**
   * Prompts user interaction to resume AudioContext (browser autoplay policy unlock).
   */
  const enableAudio = async () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContextClass();
        }
        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
      }
    } catch (err) {
      console.warn('Failed to resume AudioContext:', err);
    }
    setAudioEnabled(true);
  };

  /**
   * Fetches latest kitchen orders snapshot via REST API.
   */
  const fetchOrders = useCallback(async () => {
    try {
      const data = await getKitchenOrders();
      const incomingPending = data.pending || [];
      const incomingSettled = data.settled || [];

      // Check if new orders arrived during fallback polling
      if (initialLoadDoneRef.current) {
        for (const order of incomingPending) {
          if (!knownPendingIdsRef.current.has(order.id)) {
            playKitchenChime(order.daily_order_number || order.dailyOrderNumber);
            break;
          }
        }
      }

      knownPendingIdsRef.current = new Set(incomingPending.map((o) => o.id));
      setPendingOrders(incomingPending);
      setSettledOrders(incomingSettled);
      setLastRefreshed(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }));
      initialLoadDoneRef.current = true;
    } catch (err) {
      console.error('Failed to fetch kitchen orders snapshot:', err);
    } finally {
      setLoading(false);
    }
  }, [playKitchenChime]);

  const handleKitchenToggleItem = async (orderId: string, itemId: string, currentStatus: boolean) => {
    // Optimistic local state update
    setPendingOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          items: (o.items || []).map((it) =>
            it.id === itemId
              ? { ...it, is_delivered: !currentStatus, isDelivered: !currentStatus }
              : it
          )
        };
      })
    );

    try {
      await toggleItemDelivery(orderId, itemId, !currentStatus);
    } catch (err) {
      console.error('Failed to toggle item delivery from kitchen:', err);
      fetchOrders();
    }
  };

  /**
   * Handles real-time SSE order events.
   */
  const handleOrderCreated = useCallback(
    (newOrder: Order) => {
      setPendingOrders((prev) => {
        if (prev.some((o) => o.id === newOrder.id)) {
          return prev.map((o) => (o.id === newOrder.id ? newOrder : o));
        }
        const next = [...prev, newOrder];
        next.sort((a, b) => {
          const numA = a.daily_order_number || a.dailyOrderNumber || 0;
          const numB = b.daily_order_number || b.dailyOrderNumber || 0;
          return numA - numB;
        });
        return next;
      });

      knownPendingIdsRef.current.add(newOrder.id);
      playKitchenChime(newOrder.daily_order_number || newOrder.dailyOrderNumber);
    },
    [playKitchenChime]
  );

  const handleOrderUpdated = useCallback((updatedOrder: Order) => {
    setPendingOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
    setSettledOrders((prev) =>
      prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o))
    );
  }, []);

  const handleOrderSettled = useCallback((orderId: string, order?: Order) => {
    setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
    knownPendingIdsRef.current.delete(orderId);
    if (order) {
      setSettledOrders((prev) => {
        const remaining = prev.filter((o) => o.id !== orderId);
        return [order, ...remaining];
      });
    }
  }, []);

  const handleOrderCancelled = useCallback((orderId: string) => {
    setPendingOrders((prev) => prev.filter((o) => o.id !== orderId));
    setSettledOrders((prev) => prev.filter((o) => o.id !== orderId));
    knownPendingIdsRef.current.delete(orderId);
  }, []);

  /**
   * Initializes SSE connection to /api/events with fallback 5s polling.
   */
  useEffect(() => {
    let isMounted = true;
    let eventSource: EventSource | null = null;
    let fallbackInterval: NodeJS.Timeout | null = null;

    const startFallbackPolling = () => {
      if (fallbackInterval) return;
      fallbackInterval = setInterval(() => {
        if (isMounted) {
          fetchOrders();
        }
      }, 5000);
    };

    const stopFallbackPolling = () => {
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
        fallbackInterval = null;
      }
    };

    const setupEventSource = () => {
      try {
        eventSource = new EventSource('/api/events');

        eventSource.onopen = () => {
          if (!isMounted) return;
          setSseConnected(true);
          stopFallbackPolling();
        };

        eventSource.onerror = () => {
          if (!isMounted) return;
          setSseConnected(false);
          startFallbackPolling();
        };

        eventSource.addEventListener('order:created', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.order) handleOrderCreated(data.order);
          } catch (err) {
            console.error('Failed parsing order:created SSE event:', err);
          }
        });

        eventSource.addEventListener('order:updated', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.order) handleOrderUpdated(data.order);
          } catch (err) {
            console.error('Failed parsing order:updated SSE event:', err);
          }
        });

        eventSource.addEventListener('order:settled', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.orderId) handleOrderSettled(data.orderId, data.order);
          } catch (err) {
            console.error('Failed parsing order:settled SSE event:', err);
          }
        });

        eventSource.addEventListener('order:cancelled', (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.orderId) handleOrderCancelled(data.orderId);
          } catch (err) {
            console.error('Failed parsing order:cancelled SSE event:', err);
          }
        });

        // Extra fallback handler for generic messages
        eventSource.onmessage = (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            if (data?.type === 'order:created' && data.order) {
              handleOrderCreated(data.order);
            } else if (data?.type === 'order:updated' && data.order) {
              handleOrderUpdated(data.order);
            } else if (data?.type === 'order:settled' && data.orderId) {
              handleOrderSettled(data.orderId, data.order);
            } else if (data?.type === 'order:cancelled' && data.orderId) {
              handleOrderCancelled(data.orderId);
            }
          } catch {}
        };
      } catch (err) {
        console.warn('Failed to connect EventSource, engaging fallback polling:', err);
        startFallbackPolling();
      }
    };

    fetchOrders();
    setupEventSource();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      stopFallbackPolling();
    };
  }, [fetchOrders, handleOrderCreated, handleOrderUpdated, handleOrderSettled, handleOrderCancelled]);

  return (
    <div className="flex-1 flex flex-col bg-[#FAF3E0] min-h-screen pb-10 w-full overflow-x-hidden">
      
      {/* Kitchen Subheader */}
      <div className="bg-[#3E2723] text-[#FFF8E7] px-4 py-2.5 flex items-center justify-between shadow-sm border-b border-[#2C1810]">
        <div className="flex items-center space-x-2">
          <UtensilsCrossed className="w-5 h-5 text-amber-300 flex-shrink-0" />
          <div>
            <div className="flex items-center space-x-1.5">
              <h2 className="text-sm font-bold tracking-tight">Kitchen Order Tickets</h2>
              <span
                title={sseConnected ? 'Live Real-Time Sync Connected' : 'Polling Sync Mode Active'}
                className={`inline-flex items-center px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                  sseConnected
                    ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-500/50'
                    : 'bg-amber-900/80 text-amber-200 border border-amber-500/50'
                }`}
              >
                <Radio className={`w-2.5 h-2.5 mr-0.5 ${sseConnected ? 'animate-pulse text-emerald-400' : 'text-amber-400'}`} />
                {sseConnected ? 'LIVE' : 'POLL'}
              </span>
            </div>
            <p className="text-[10px] text-[#FAF3E0]/70">Read-Only • Auto-updating</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={enableAudio}
            title={audioEnabled ? 'Alert Sound Active' : 'Click to Enable Alert Sound'}
            className={`min-h-[44px] min-w-[44px] px-3 py-2 text-xs font-semibold rounded-xl flex items-center space-x-1.5 transition-colors ${
              audioEnabled
                ? 'bg-emerald-800 text-emerald-100 hover:bg-emerald-700'
                : 'bg-[#4E342E] text-amber-200 hover:bg-[#5D4037]'
            }`}
          >
            <Bell className="w-4 h-4" />
            <span className="text-xs font-bold">{audioEnabled ? 'Sound ON' : 'Enable Sound'}</span>
          </button>
        </div>
      </div>

      {/* Main Content Sections: Pending and Settled */}
      <div className="p-3 space-y-4 flex-1 max-w-md mx-auto w-full">

        {/* Prominent Audio Unlock Banner (Mobile User Gesture Policy) */}
        {!audioEnabled && (
          <div
            role="button"
            tabIndex={0}
            onClick={enableAudio}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') enableAudio();
            }}
            data-testid="enable-audio-banner"
            className="bg-amber-100 border-2 border-amber-400/90 text-amber-900 px-3.5 py-2.5 rounded-2xl flex items-center justify-between shadow-sm cursor-pointer min-h-[44px] transition-all hover:bg-amber-200/80"
          >
            <div className="flex items-center space-x-2 min-w-0 pr-2">
              <Volume2 className="w-5 h-5 text-amber-800 flex-shrink-0" />
              <span className="text-xs font-bold leading-snug">
                Tap to enable kitchen sound chime
              </span>
            </div>
            <span
              className="bg-[#3E2723] text-amber-200 text-xs font-bold px-3 py-2 rounded-xl min-h-[44px] flex items-center justify-center hover:bg-[#2C1810] transition-colors flex-shrink-0"
            >
              Activate
            </span>
          </div>
        )}
        
        {/* Active Pending Orders Section */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-amber-800" />
              <h3 className="text-sm font-black text-[#3E2723] uppercase tracking-wide">
                Live Pending Orders ({pendingOrders.length})
              </h3>
            </div>
            <span className="text-[10px] text-[#8D6E63] font-mono">
              Refreshed: {lastRefreshed}
            </span>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#EADCC8] text-xs text-[#8D6E63]">
                Loading kitchen tickets...
              </div>
            ) : pendingOrders.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-[#EADCC8] text-xs text-[#8D6E63]">
                No pending orders. Kitchen is all caught up! 🎉
              </div>
            ) : (
              pendingOrders.map((order) => {
                const orderNum = order.daily_order_number || order.dailyOrderNumber || order.order_number || 1;
                const items = order.items || [];
                const orderDate = new Date(order.created_at || order.createdAt || Date.now());
                const timeString = isNaN(orderDate.getTime())
                  ? ''
                  : orderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={order.id}
                    data-testid={`kitchen-ticket-${order.id}`}
                    className="p-4 rounded-2xl bg-white border-2 border-amber-400/80 shadow-md flex flex-col space-y-2 relative overflow-hidden"
                  >
                    {/* Top ticket strip */}
                    <div className="flex justify-between items-center border-b border-[#F5EBE1] pb-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-3xl font-black text-[#3E2723]">
                          #{orderNum}
                        </span>
                        {(() => {
                          const deliveredCount = items.filter((it) => it.is_delivered || it.isDelivered).length;
                          const allDelivered = items.length > 0 && deliveredCount === items.length;
                          return (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              allDelivered
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : deliveredCount > 0
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}>
                              {allDelivered ? '✓ All Items Delivered' : `${deliveredCount}/${items.length} Delivered`}
                            </span>
                          );
                        })()}
                      </div>
                      <span className="text-[10px] text-[#8D6E63] font-mono">
                        {timeString}
                      </span>
                    </div>

                    {/* Ticket Items (Big and legible for cooks, with green delivery ticks) */}
                    <div className="space-y-1.5 py-1">
                      {items.map((it, idx) => {
                        const isDelivered = Boolean(it.is_delivered || it.isDelivered);
                        return (
                          <div
                            key={it.id || idx}
                            onClick={() => it.id && handleKitchenToggleItem(order.id, it.id, isDelivered)}
                            title={isDelivered ? 'Delivered (click to toggle)' : 'Pending (click to toggle)'}
                            className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isDelivered
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-xs'
                                : 'bg-[#FAF3E0]/70 border-[#D7CCC8] text-[#3E2723] hover:bg-[#FAF3E0]'
                            }`}
                          >
                            <div className="flex items-center space-x-2 text-sm font-bold min-w-0 pr-2">
                              <span className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-black flex-shrink-0 border transition-all ${
                                isDelivered
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                                  : 'bg-[#FAF3E0] border-[#D7CCC8] text-[#8D493A]'
                              }`}>
                                {isDelivered ? <Check className="w-4 h-4 stroke-[3]" /> : `${it.quantity || it.qty}x`}
                              </span>
                              <span className={`leading-snug break-words ${isDelivered ? 'line-through text-emerald-800 opacity-80' : ''}`}>
                                {it.quantity || it.qty}x {it.item_name || it.name}
                              </span>
                            </div>

                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex-shrink-0 flex items-center space-x-1 ${
                              isDelivered
                                ? 'bg-emerald-200/90 text-emerald-900 border border-emerald-300'
                                : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}>
                              {isDelivered ? (
                                <>
                                  <Check className="w-3 h-3 stroke-[3]" />
                                  <span>Delivered</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-3 h-3" />
                                  <span>Pending</span>
                                </>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {order.notes && (
                      <div className="text-xs bg-amber-50 p-2.5 rounded-xl text-amber-900 border border-amber-200 font-medium">
                        Chef Note: {order.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Settled Orders Section (Recent Completed Archive) */}
        <div className="pt-2">
          <div className="flex items-center space-x-1.5 mb-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            <h3 className="text-xs font-bold text-[#5D4037] uppercase tracking-wide">
              Settled Orders Today ({settledOrders.length})
            </h3>
          </div>

          <div className="space-y-2 opacity-85">
            {settledOrders.length === 0 ? (
              <div className="p-4 text-center bg-white/60 rounded-xl border border-[#EADCC8] text-xs text-[#8D6E63]">
                No completed orders yet today.
              </div>
            ) : (
              settledOrders.slice(0, 10).map((order) => {
                const orderNum = order.daily_order_number || order.dailyOrderNumber || order.order_number || 1;
                const items = order.items || [];

                return (
                  <div
                    key={order.id}
                    data-testid={`kitchen-settled-${order.id}`}
                    className="p-2.5 rounded-xl bg-white border border-[#EADCC8] flex justify-between items-center text-xs"
                  >
                    <div className="flex items-center space-x-2 min-w-0 pr-2">
                      <span className="font-extrabold text-[#3E2723] text-sm flex-shrink-0">
                        #{orderNum}
                      </span>
                      <span className="text-[11px] text-[#5D4037] truncate">
                        {items.map((it) => `${it.quantity || it.qty}x ${it.item_name || it.name}`).join(', ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-700 font-semibold px-2 py-0.5 rounded bg-emerald-50 flex-shrink-0">
                      Settled
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Kitchen;

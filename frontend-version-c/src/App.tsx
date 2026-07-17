import React, { useState, useEffect } from 'react';
import { ShoppingBag, ShoppingCart, CreditCard, Home, RefreshCw, Wifi, WifiOff, Battery, Network } from 'lucide-react';
import { Product, CartItem, ApiMetric, CacheLog } from './types';
import { fetchWithMetrics } from './apiHelper';
import { queueOfflineOrder, getQueuedOrders, removeQueuedOrder } from './indexedDbHelper';
import { BatterySimulator } from './BatterySimulator';

interface AdaptiveLog {
  timestamp: number;
  batteryMode: string;
  networkMode: string;
  selectedStrategy: string;
  reason: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'products' | 'cart' | 'checkout'>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Offline and synchronization status
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [offlineQueueLength, setOfflineQueueLength] = useState<number>(0);

  // Simulated metrics
  const [batteryMode, setBatteryMode] = useState<string>(BatterySimulator.getMode());
  const [simulatedNetwork, setSimulatedNetwork] = useState<string>((window as any).simulatedNetworkMode || 'Fast4G');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Metric collections
  const [localMetrics, setLocalMetrics] = useState<ApiMetric[]>([]);
  const [cacheLogs, setCacheLogs] = useState<CacheLog[]>([]);
  const [adaptiveLogs, setAdaptiveLogs] = useState<AdaptiveLog[]>([]);

  // Synchronize orders with Laravel API
  const syncOfflineOrders = async () => {
    const queue = await getQueuedOrders();
    if (queue.length === 0) return;

    setSyncing(true);
    console.log('[Sync] Starting synchronization of offline queue. Count:', queue.length);
    let successCount = 0;
    let failureCount = 0;

    for (const order of queue) {
      try {
        const payload = {
          orders: order.orders,
          customer_name: order.customer_name,
          customer_email: order.customer_email
        };

        const response = await fetch('http://127.0.0.1:8000/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          await removeQueuedOrder(order.id!);
          successCount++;
          console.log('[Sync] Order successfully synchronized:', order.id);
        } else {
          failureCount++;
          console.error('[Sync] Failed to sync order, status:', response.status);
        }
      } catch (err) {
        failureCount++;
        console.error('[Sync] Sync request error:', err);
      }
    }

    setSyncing(false);
    updateQueueLength();
    console.log(`[Sync] Finished. Success: ${successCount}, Failures: ${failureCount}`);
  };

  const updateQueueLength = async () => {
    const queue = await getQueuedOrders();
    setOfflineQueueLength(queue.length);
  };

  useEffect(() => {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-adaptive.js')
        .then(reg => {
          console.log('Service Worker Registered (Version C)', reg);
        })
        .catch(err => console.error('Service Worker Registration Failed', err));
    }

    // Set up BroadcastChannel listener for PWA Cache and Adaptive logs
    const swChannel = new BroadcastChannel('sw-cache-channel');
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data) {
        if (event.data.type === 'CACHE_LOG') {
          const log = event.data.payload as CacheLog;
          setCacheLogs(prev => [log, ...prev].slice(0, 10));
          
          // Expose for Playwright metrics collection
          (window as any).collectedCacheLogs = (window as any).collectedCacheLogs || [];
          (window as any).collectedCacheLogs.push(log);
        }
        if (event.data.type === 'ADAPTIVE_LOG') {
          const log = event.data.payload as AdaptiveLog;
          setAdaptiveLogs(prev => [log, ...prev].slice(0, 10));

          // Expose for Playwright metrics collection
          (window as any).collectedAdaptiveLogs = (window as any).collectedAdaptiveLogs || [];
          (window as any).collectedAdaptiveLogs.push(log);
        }
      }
    };
    swChannel.addEventListener('message', handleSWMessage);

    // Initial load
    setLoading(true);
    fetchWithMetrics('http://127.0.0.1:8000/api/products')
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error('Failed to load products', err))
      .finally(() => setLoading(false));

    updateQueueLength();

    // Connection events
    const goOnline = () => {
      setIsOnline(true);
      syncOfflineOrders();
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('offline-queue-changed', updateQueueLength);

    const handleBatteryChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      setBatteryMode(customEvent.detail);
    };
    window.addEventListener('battery-simulator-changed', handleBatteryChange);

    // Watch window network mode configuration changes (simulated by Playwright via console/window injection)
    const interval = setInterval(() => {
      if ((window as any).simulatedNetworkMode && (window as any).simulatedNetworkMode !== simulatedNetwork) {
        setSimulatedNetwork((window as any).simulatedNetworkMode);
      }
    }, 500);

    const handleMetric = (e: Event) => {
      const customEvent = e as CustomEvent<ApiMetric>;
      setLocalMetrics(prev => [customEvent.detail, ...prev].slice(0, 10));
    };
    window.addEventListener('api-metric-added', handleMetric);

    // Expose control interface for Playwright automation
    (window as any).getCollectedMetrics = () => {
      return {
        apiMetrics: (window as any).apiMetrics || [],
        consoleLogs: (window as any).consoleLogs || [],
        jsErrors: (window as any).jsErrors || [],
        cacheLogs: (window as any).collectedCacheLogs || [],
        adaptiveLogs: (window as any).collectedAdaptiveLogs || [],
        offlineQueueLength: (window as any).offlineQueueLength || 0,
      };
    };

    // Real cache stats helper function
    (window as any).getCacheSizeStats = async () => {
      try {
        const keys = await window.caches.keys();
        let totalBytes = 0;
        let entryCount = 0;
        for (const key of keys) {
          const cache = await window.caches.open(key);
          const requests = await cache.keys();
          entryCount += requests.length;
          for (const req of requests) {
            const res = await cache.match(req);
            if (res) {
              const blob = await res.blob();
              totalBytes += blob.size;
            }
          }
        }
        return { entryCount, totalBytes };
      } catch (err) {
        return { entryCount: 0, totalBytes: 0, error: String(err) };
      }
    };

    return () => {
      swChannel.removeEventListener('message', handleSWMessage);
      swChannel.close();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('offline-queue-changed', updateQueueLength);
      window.removeEventListener('battery-simulator-changed', handleBatteryChange);
      window.removeEventListener('api-metric-added', handleMetric);
      clearInterval(interval);
    };
  }, [simulatedNetwork]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity } : item));
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const payload = {
      orders: cart.map(item => ({ product_id: item.product.id, quantity: item.quantity })),
      customer_name: name,
      customer_email: email,
    };

    if (!isOnline) {
      await queueOfflineOrder(payload);
      setSuccessMessage('Offline order stored. Syncing will begin automatically when online.');
      setCart([]);
      setName('');
      setEmail('');
      setActiveTab('home');
      return;
    }

    setLoading(true);
    try {
      const response = await fetchWithMetrics('http://127.0.0.1:8000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSuccessMessage('Order placed successfully!');
        setCart([]);
        setName('');
        setEmail('');
        setActiveTab('home');
      } else {
        alert('Checkout failed');
      }
    } catch (err) {
      await queueOfflineOrder(payload);
      setSuccessMessage('Network request failed. Order stored offline.');
      setCart([]);
      setName('');
      setEmail('');
      setActiveTab('home');
    } finally {
      setLoading(false);
    }
  };

  const cartTotal = cart.reduce((total, item) => total + parseFloat(item.product.price) * item.quantity, 0);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="bg-purple-600 p-2 rounded-lg text-white shadow-lg shadow-purple-500/30">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              Adaptive Smart PWA <span className="text-sm font-semibold text-slate-500">(Version C)</span>
            </span>
          </div>

          <div className="flex items-center space-x-6">
            {/* Battery / Network simulation status */}
            <div className="flex items-center space-x-4 text-xs font-mono text-slate-400 bg-slate-950 px-3 py-1.5 rounded-full border border-slate-800">
              <span className="flex items-center space-x-1">
                <Battery className={`w-3.5 h-3.5 ${batteryMode === 'LOW' ? 'text-red-400' : 'text-green-400'}`} />
                <span>Battery: {batteryMode}</span>
              </span>
              <span className="flex items-center space-x-1">
                <Network className="w-3.5 h-3.5 text-indigo-400" />
                <span>Net: {simulatedNetwork}</span>
              </span>
              <span className="flex items-center space-x-1">
                {isOnline ? (
                  <span className="text-emerald-400">Online</span>
                ) : (
                  <span className="text-red-400 animate-pulse">Offline</span>
                )}
              </span>
            </div>

            <nav className="flex space-x-1">
              <button
                onClick={() => { setActiveTab('home'); setSuccessMessage(null); }}
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg transition ${activeTab === 'home' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </button>
              <button
                onClick={() => { setActiveTab('products'); setSuccessMessage(null); }}
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg transition ${activeTab === 'products' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Products</span>
              </button>
              <button
                onClick={() => { setActiveTab('cart'); setSuccessMessage(null); }}
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg transition relative ${activeTab === 'cart' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Cart</span>
                {cart.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-purple-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {cart.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setActiveTab('checkout'); setSuccessMessage(null); }}
                className={`flex items-center space-x-1 px-4 py-2 rounded-lg transition ${activeTab === 'checkout' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Checkout</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        {successMessage && (
          <div className="mb-6 p-4 bg-purple-500/15 border border-purple-500/30 text-purple-400 rounded-xl flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="font-bold hover:text-purple-200">×</button>
          </div>
        )}

        {activeTab === 'home' && (
          <div className="py-12 text-center">
            <h1 className="text-5xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Adaptive Caching PWA
            </h1>
            <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
              This variant (Version C) uses a custom Service Worker that dynamically adapts between **Cache First** and **Network First** strategies based on network latency and battery simulations.
            </p>
            <button
              onClick={() => setActiveTab('products')}
              className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-purple-600/20 hover:shadow-purple-600/30 transition-all hover:-translate-y-0.5"
            >
              Browse Products
            </button>
          </div>
        )}

        {activeTab === 'products' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-slate-200">Available Products</h2>
            {loading && products.length === 0 ? (
              <div className="flex justify-center items-center py-12">
                <RefreshCw className="w-8 h-8 text-purple-500 animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map(product => (
                  <div key={product.id} className="bg-slate-950/40 border border-slate-800/80 rounded-2xl overflow-hidden hover:border-slate-700/80 transition flex flex-col">
                    <img src={product.image} alt={product.name} className="w-full h-48 object-cover" />
                    <div className="p-5 flex-1 flex flex-col">
                      <h3 className="font-bold text-lg text-slate-200 mb-2">{product.name}</h3>
                      <p className="text-sm text-slate-400 mb-4 flex-1">{product.description}</p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xl font-bold text-purple-400">${parseFloat(product.price).toFixed(2)}</span>
                        <button
                          onClick={() => addToCart(product)}
                          className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                        >
                          Add To Cart
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'cart' && (
          <div>
            <h2 className="text-2xl font-bold mb-6 text-slate-200">Shopping Cart</h2>
            {cart.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                Your cart is empty.
              </div>
            ) : (
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6">
                <div className="space-y-4 mb-6">
                  {cart.map(item => (
                    <div key={item.product.id} className="flex items-center justify-between py-4 border-b border-slate-800 last:border-0">
                      <div className="flex items-center space-x-4">
                        <img src={item.product.image} alt={item.product.name} className="w-12 h-12 object-cover rounded-lg" />
                        <div>
                          <h4 className="font-semibold text-slate-200">{item.product.name}</h4>
                          <span className="text-sm text-slate-400">${parseFloat(item.product.price).toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)}
                          className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-center"
                        />
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="text-red-400 hover:text-red-300 text-sm font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                  <span className="text-slate-400 font-medium">Subtotal:</span>
                  <span className="text-2xl font-bold text-purple-400">${cartTotal.toFixed(2)}</span>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setActiveTab('checkout')}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-6 py-3 rounded-xl transition"
                  >
                    Proceed to Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'checkout' && (
          <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-slate-200">Checkout</h2>
            {cart.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                No items in cart to checkout.
              </div>
            ) : (
              <form onSubmit={handleCheckout} className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-1">Customer Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:border-purple-500 focus:outline-none"
                    placeholder="Enter name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-400 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-slate-200 focus:border-purple-500 focus:outline-none"
                    placeholder="Enter email"
                  />
                </div>
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={loading && isOnline}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
                  >
                    {loading && isOnline ? 'Processing...' : !isOnline ? `Queue Order Offline ($${cartTotal.toFixed(2)})` : `Place Order ($${cartTotal.toFixed(2)})`}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Real-time Metric Panels */}
      <footer className="bg-slate-950 border-t border-slate-800 p-4 text-xs font-mono">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-purple-400 font-bold">Adaptive Decision Logs</span>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {adaptiveLogs.length === 0 ? (
                <span className="text-slate-500">No decisions made yet.</span>
              ) : (
                adaptiveLogs.map((log, idx) => (
                  <div key={idx} className="text-slate-400">
                    <span className="text-yellow-400">[{log.selectedStrategy}]</span> {log.reason}
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <span className="text-emerald-400 font-bold">API Performance Logs</span>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {localMetrics.length === 0 ? (
                <span className="text-slate-500">No requests made.</span>
              ) : (
                localMetrics.map((m, idx) => (
                  <div key={idx} className="text-slate-400">
                    [{m.statusCode}] {m.method} -{' '}
                    <span className="text-yellow-400">{m.responseTime.toFixed(2)}ms</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <span className="text-teal-400 font-bold">Cache Engine Metrics</span>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {cacheLogs.length === 0 ? (
                <span className="text-slate-500">No cache events.</span>
              ) : (
                cacheLogs.map((log, idx) => (
                  <div key={idx} className="text-slate-400">
                    [{log.event.toUpperCase()}] {log.resourceName} -{' '}
                    <span className="text-slate-500">{log.strategyUsed}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

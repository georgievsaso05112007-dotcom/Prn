import type { MarketTicker } from '../types';

type Callback = (data: MarketTicker) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, Set<Callback>> = new Map();
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentUrl: string | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  connect(url: string): void {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.currentUrl = url;
    this.shouldReconnect = true;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to', url);
        this.isConnecting = false;
        this.reconnectDelay = 1000;

        // Re-subscribe to all existing subscriptions
        this.subscribers.forEach((_, symbol) => {
          this.sendSubscribe(symbol);
        });
      };

      this.ws.onmessage = event => {
        this.handleMessage(event);
      };

      this.ws.onerror = error => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('[WebSocket] Connection closed');
        this.isConnecting = false;
        this.ws = null;

        if (this.shouldReconnect && this.subscribers.size > 0) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      console.error('[WebSocket] Failed to connect:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(symbol: string, callback: Callback): () => void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
      this.sendSubscribe(symbol);
    }

    this.subscribers.get(symbol)!.add(callback);

    return () => {
      this.unsubscribe(symbol, callback);
    };
  }

  unsubscribe(symbol: string, callback: Callback): void {
    const callbacks = this.subscribers.get(symbol);
    if (!callbacks) return;

    callbacks.delete(callback);

    if (callbacks.size === 0) {
      this.subscribers.delete(symbol);
      this.sendUnsubscribe(symbol);
    }
  }

  private sendSubscribe(symbol: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'subscribe',
          symbol,
        }),
      );
    }
  }

  private sendUnsubscribe(symbol: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'unsubscribe',
          symbol,
        }),
      );
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data as string);

      if (data.type === 'ticker' && data.symbol) {
        const ticker: MarketTicker = data.ticker;
        const callbacks = this.subscribers.get(data.symbol);

        if (callbacks) {
          callbacks.forEach(cb => {
            try {
              cb(ticker);
            } catch (err) {
              console.error('[WebSocket] Callback error:', err);
            }
          });
        }
      }
    } catch (error) {
      console.error('[WebSocket] Failed to parse message:', error);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.currentUrl) return;

    console.log(`[WebSocket] Reconnecting in ${this.reconnectDelay}ms...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentUrl && this.shouldReconnect) {
        this.connect(this.currentUrl);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
      }
    }, this.reconnectDelay);
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
export default WebSocketService;

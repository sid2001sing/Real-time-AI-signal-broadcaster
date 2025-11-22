import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
// [VS CODE] Import enabled for real connection:
import { io, Socket } from 'socket.io-client';

interface StockSignal {
  symbol: string;
  action: 'BUY' | 'SELL';
  price: number;
  timestamp: Date;
  confidence: number;
  reason: string;
}

interface ChatMessage {
  text: string;
  sender: 'User' | 'Gemini' | 'System';
  time: Date;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  // [VS CODE] Using inline template to avoid 'app.html' errors
  template: `
    <div class="app-container">
      
      <!-- Top Header -->
      <header class="top-bar">
        <div class="logo-section">
          <div class="logo-icon">AI</div>
          <h1>Gemini Market Broadcaster</h1>
        </div>
        <div class="status-indicator">
          <span class="dot" [class.connected]="connected()"></span>
          {{ connected() ? 'SOCKET CONNECTED' : 'DISCONNECTED' }}
        </div>
      </header>

      <div class="main-layout">
        
        <!-- LEFT SIDE: Signal Feed -->
        <div class="feed-section">
          <div class="feed-header">
            <h2><span class="pulse">●</span> Live Insights Stream</h2>
          </div>

          <!-- Waiting Message -->
          <div *ngIf="signals().length === 0" class="waiting-state">
            <div class="spinner" *ngIf="connected()"></div>
            <p *ngIf="connected()">Waiting for Gemini analysis (updates every 15s)...</p>
            <p *ngIf="!connected()" class="error-text">Connecting to backend...</p>
          </div>

          <!-- Signal Cards List -->
          <div class="cards-list">
            <div *ngFor="let sig of signals()" class="card" [ngClass]="sig.action">
              
              <!-- Background Action Text (Watermark) -->
              <div class="watermark">{{ sig.action }}</div>

              <div class="card-content">
                <div class="card-left">
                  <div class="ticker-row">
                    <span class="symbol">{{ sig.symbol }}</span>
                    <span class="badge">{{ sig.action }}</span>
                  </div>
                  <p class="reason">{{ sig.reason }}</p>
                </div>
                
                <div class="card-right">
                  <div class="price">\${{ sig.price }}</div>
                  <div class="confidence">Confidence: {{ sig.confidence }}%</div>
                  <div class="time">{{ sig.timestamp | date:'HH:mm:ss' }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- RIGHT SIDE: Chatbot -->
        <div class="chat-section">
          <div class="chat-header">
            <h3>Market Assistant</h3>
            <small>Powered by Gemini Flash</small>
          </div>

          <div class="chat-history" #chatContainer>
            <div *ngFor="let msg of chatHistory()" 
                 class="message-row" 
                 [ngClass]="{'user-row': msg.sender === 'User'}">
              
              <div class="message-bubble" 
                   [ngClass]="{
                     'user-bubble': msg.sender === 'User',
                     'ai-bubble': msg.sender === 'Gemini',
                     'sys-bubble': msg.sender === 'System'
                   }">
                {{ msg.text }}
              </div>
              <div class="message-meta">{{ msg.sender }} • {{ msg.time | date:'shortTime' }}</div>
            </div>
          </div>

          <div class="chat-input-area">
            <input type="text" 
                   [(ngModel)]="chatInput" 
                   (keyup.enter)="sendMessage()"
                   [disabled]="!connected()"
                   placeholder="Ask about a stock..." />
            <button (click)="sendMessage()" [disabled]="!connected()">Send</button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* --- GLOBAL LAYOUT --- */
    :host {
      display: block;
      height: 100vh;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0f1115;
      color: #e0e0e0;
      overflow: hidden;
    }
    
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    /* --- HEADER --- */
    .top-bar {
      height: 60px;
      background-color: #161b22;
      border-bottom: 1px solid #30363d;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
    }
    .logo-section { display: flex; align-items: center; gap: 10px; }
    .logo-icon {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, #2563eb, #9333ea);
      border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; color: white;
    }
    h1 { font-size: 18px; margin: 0; font-weight: 600; }
    .status-indicator { font-size: 12px; font-family: monospace; display: flex; align-items: center; gap: 8px; }
    .dot { width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; }
    .dot.connected { background-color: #22c55e; box-shadow: 0 0 8px #22c55e; }

    /* --- MAIN LAYOUT --- */
    .main-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* --- LEFT FEED --- */
    .feed-section {
      flex: 3;
      padding: 20px;
      overflow-y: auto;
      border-right: 1px solid #30363d;
    }
    .feed-header h2 { font-size: 14px; text-transform: uppercase; color: #8b949e; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
    .pulse { color: #3b82f6; animation: pulse 2s infinite; }
    
    .waiting-state {
      text-align: center; padding: 60px; color: #8b949e; border: 1px dashed #30363d; border-radius: 8px;
    }
    .error-text { color: #ef4444; }
    .spinner {
      width: 30px; height: 30px; border: 4px solid #30363d; border-top: 4px solid #3b82f6;
      border-radius: 50%; margin: 0 auto 15px; animation: spin 1s linear infinite;
    }

    /* CARDS */
    .cards-list { display: flex; flex-direction: column; gap: 15px; }
    .card {
      background: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 20px;
      position: relative; overflow: hidden; transition: transform 0.2s;
    }
    .card:hover { transform: translateX(5px); border-color: #58a6ff; }
    
    .watermark {
      position: absolute; top: -10px; right: 10px; font-size: 80px; font-weight: 900;
      opacity: 0.05; pointer-events: none; z-index: 0;
    }
    .card.BUY .watermark { color: #22c55e; }
    .card.SELL .watermark { color: #ef4444; }

    .card-content { display: flex; justify-content: space-between; position: relative; z-index: 1; }
    
    .ticker-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .symbol { font-size: 24px; font-weight: bold; color: #fff; }
    .badge { padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
    .card.BUY .badge { background: #064e3b; color: #6ee7b7; }
    .card.SELL .badge { background: #450a0a; color: #fca5a5; }
    
    .reason { color: #8b949e; font-size: 14px; max-width: 400px; margin: 0; }
    
    .card-right { text-align: right; }
    .price { font-size: 20px; font-family: monospace; color: #e0e0e0; }
    .confidence { font-size: 12px; color: #8b949e; margin-top: 4px; }
    .time { font-size: 12px; color: #58a6ff; margin-top: 8px; font-family: monospace; }

    /* --- RIGHT CHAT --- */
    .chat-section {
      flex: 1;
      background-color: #0d1117;
      display: flex; flex-direction: column;
      min-width: 300px; max-width: 400px;
    }
    .chat-header { padding: 15px; border-bottom: 1px solid #30363d; }
    .chat-header h3 { margin: 0; font-size: 16px; }
    .chat-header small { color: #8b949e; font-size: 11px; }

    .chat-history { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 15px; }
    
    .message-row { display: flex; flex-direction: column; align-items: flex-start; }
    .message-row.user-row { align-items: flex-end; }
    
    .message-bubble { padding: 10px 14px; border-radius: 12px; max-width: 85%; font-size: 14px; line-height: 1.4; }
    .ai-bubble { background: #1f2937; color: #e0e0e0; border-top-left-radius: 2px; }
    .user-bubble { background: #2563eb; color: #fff; border-top-right-radius: 2px; }
    .sys-bubble { background: #450a0a; color: #fca5a5; font-size: 12px; }

    .message-meta { font-size: 10px; color: #484f58; margin-top: 4px; }

    .chat-input-area { padding: 15px; border-top: 1px solid #30363d; display: flex; gap: 10px; }
    input {
      flex: 1; background: #161b22; border: 1px solid #30363d; color: white;
      padding: 10px; border-radius: 6px; outline: none;
    }
    input:focus { border-color: #3b82f6; }
    button {
      background: #238636; color: white; border: none; padding: 0 15px;
      border-radius: 6px; cursor: pointer; font-weight: bold;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Animations */
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
  `]
})
export class AppComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('chatContainer') private chatContainer!: ElementRef;
  
  // [VS CODE] Use strict typing
  private socket!: Socket; 
  
  connected = signal(false);
  signals = signal<StockSignal[]>([]);
  chatHistory = signal<ChatMessage[]>([
    { text: 'System: Initializing...', sender: 'System', time: new Date() }
  ]);
  chatInput = '';

  ngOnInit() {
    // [VS CODE] Real Connection Logic (Uncommented)
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      this.connected.set(true);
      this.chatHistory.update(h => [...h, { 
        text: 'Connected! Waiting for live data...', 
        sender: 'System', 
        time: new Date() 
      }]);
    });

    this.socket.on('disconnect', () => this.connected.set(false));

    this.socket.on('ai-signal', (data: StockSignal) => {
      this.signals.update(current => [data, ...current]);
    });

    this.socket.on('ai-chat-response', (response: { text: string, sender: 'Gemini' }) => {
      const reply: ChatMessage = {
        text: response.text,
        sender: 'Gemini',
        time: new Date()
      };
      this.chatHistory.update(h => [...h, reply]);
      this.scrollToBottom();
    });
  }

  ngOnDestroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  scrollToBottom(): void {
    try {
      this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
    } catch(err) { }
  }

  sendMessage() {
    if (!this.chatInput.trim()) return;

    // 1. Add User Message to UI immediately
    const userMsg: ChatMessage = { 
      text: this.chatInput, 
      sender: 'User', 
      time: new Date() 
    };
    this.chatHistory.update(h => [...h, userMsg]);

    // 2. Send to Backend (Uncommented)
    if (this.socket) this.socket.emit('user-message', this.chatInput);

    // 3. Clear input
    this.chatInput = '';
    this.scrollToBottom();
  }
}

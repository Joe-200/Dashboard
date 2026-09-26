import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  HostListener,
  ChangeDetectionStrategy,
  ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { AiService, GraphData } from '../../ai-service.service';

// Register all Chart.js components once
Chart.register(...registerables);

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  graph?: GraphData;
}

const STORAGE_KEY = 'aiChatHistory';
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;

@Component({
  selector: 'app-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-component.component.html',
  styleUrl: './ai-component.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiComponent implements AfterViewInit, OnDestroy {

  @ViewChild('chartCanvas')   chartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatContainer') chatContainer!: ElementRef<HTMLElement>;

  query = '';
  loading = false;
  error = '';

  messages: ChatMessage[] = [];

  private chartInstance: Chart | null = null;

  readonly suggestedPrompts: string[] = [
    'What is the occupancy rate today?',
    'Show me revenue for last month',
    'List unverified guests',
    'Which rooms need maintenance?'
  ];

  showClearConfirm = false;

  constructor(
    private readonly aiService: AiService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  // ------------------------------------------------------------
  // LIFECYCLE
  // ------------------------------------------------------------
  ngAfterViewInit(): void {
    this.loadHistory();
    this.cdr.detectChanges();
    setTimeout(() => this.scrollToBottom(), 0);
  }

  ngOnDestroy(): void {
    this.destroyChart();
    this.saveHistory();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showClearConfirm) {
      this.showClearConfirm = false;
      this.cdr.markForCheck();
    }
  }

  // ------------------------------------------------------------
  // TRACKBY HELPERS (performance)
  // ------------------------------------------------------------
  trackByIndex(index: number): number { return index; }
  trackByMsgIndex(index: number): number { return index; }

  // ------------------------------------------------------------
  // HISTORY
  // ------------------------------------------------------------
  private loadHistory(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Array<Omit<ChatMessage, 'timestamp'> & { timestamp: string }>;
      this.messages = parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));

      // Re-render last graph if any
      const lastWithGraph = [...this.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.graph);

      if (lastWithGraph?.graph) {
        setTimeout(() => this.renderChart(lastWithGraph.graph!), 150);
      }
    } catch (e) {
      console.warn('Failed to load chat history', e);
    }
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.messages));
    } catch (e) {
      console.warn('Failed to save chat history', e);
    }
  }

  // ------------------------------------------------------------
  // CLEAR HISTORY
  // ------------------------------------------------------------
  requestClearHistory(): void {
    this.showClearConfirm = true;
  }

  cancelClearHistory(): void {
    this.showClearConfirm = false;
  }

  confirmClearHistory(): void {
    this.clearHistory();
    this.showClearConfirm = false;
  }

  clearHistory(): void {
    this.messages = [];
    this.destroyChart();
    localStorage.removeItem(STORAGE_KEY);
  }

  // ------------------------------------------------------------
  // SUGGESTED PROMPTS
  // ------------------------------------------------------------
  usePrompt(prompt: string): void {
    if (this.loading) return;
    this.query = prompt;
    this.ask();
  }

  // ------------------------------------------------------------
  // SEND
  // ------------------------------------------------------------
  ask(): void {
    if (this.loading) return;
    const text = this.query.trim();
    if (!text) return;

    this.messages = [
      ...this.messages,
      { role: 'user', content: text, timestamp: new Date() }
    ];
    this.saveHistory();

    this.query = '';
    this.loading = true;
    this.error = '';
    this.destroyChart();

    this.aiService.ask(text).subscribe({
      next: (res) => {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: res.textSummary,
          timestamp: new Date(),
          graph: res.showGraph ? res.graph : undefined
        };

        this.messages = [...this.messages, assistantMessage];
        this.saveHistory();
        this.loading = false;

        if (assistantMessage.graph) {
          // Wait for the DOM to render the canvas
          setTimeout(() => this.renderChart(assistantMessage.graph!), 0);
        }

        this.cdr.markForCheck();
        this.scrollToBottom();
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Failed to get AI response: ' + (err?.message ?? 'Unknown error');

        this.messages = [
          ...this.messages,
          {
            role: 'assistant',
            content: '⚠️ Error: ' + (err?.message ?? 'Unknown error'),
            timestamp: new Date()
          }
        ];
        this.saveHistory();
        this.cdr.markForCheck();
        this.scrollToBottom();
      }
    });
  }

  // ------------------------------------------------------------
  // CHART
  // ------------------------------------------------------------
  private renderChart(graph: GraphData): void {
    if (!this.chartCanvas) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const chartData = {
      labels: graph.labels,
      datasets: graph.datasets.map(ds => ({
        label: ds.label,
        data: ds.data,
        backgroundColor: this.getColors(graph.datasets.length, ds.data.length),
        borderColor: '#2563EB',
        borderWidth: 1
      }))
    };

    let type: 'bar' | 'pie' | 'line' = 'bar';
    if (graph.type === 'PIE') type = 'pie';
    else if (graph.type === 'LINE') type = 'line';

    this.destroyChart();

    this.chartInstance = new Chart(ctx, {
      type,
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: !!graph.title,
            text: graph.title ?? '',
            color: '#0F172A',
            font: { size: 13, weight: 700 }
          },
          legend: {
            display: graph.datasets.length > 0,
            labels: {
              color: '#334155',
              font: { size: 12, weight: 600 },
              boxWidth: 12,
              boxHeight: 12,
              usePointStyle: true
            }
          }
        },
        scales: type === 'pie' ? undefined : {
          x: {
            ticks: { color: '#64748B', font: { size: 11 } },
            grid: { color: 'rgba(15, 23, 42, 0.05)' }
          },
          y: {
            ticks: { color: '#64748B', font: { size: 11 } },
            grid: { color: 'rgba(15, 23, 42, 0.05)' }
          }
        }
      }
    });
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  // ------------------------------------------------------------
  // COLOR PALETTE — matches brand tokens
  // ------------------------------------------------------------
  private getColors(numDatasets: number, numLabels: number): string[] {
    const preset = [
      '#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED',
      '#0891B2', '#4F46E5', '#65A30D', '#DB2777', '#0EA5E9'
    ];
    const count = numDatasets === 1 && numLabels > 0 ? numLabels : numDatasets;
    return Array.from({ length: count }, (_, i) => preset[i % preset.length]);
  }

  // ------------------------------------------------------------
  // TEMPLATE HELPERS
  // ------------------------------------------------------------
  shouldShowTimestamp(index: number): boolean {
    if (index === 0) return true;

    const current  = new Date(this.messages[index].timestamp).getTime();
    const previous = new Date(this.messages[index - 1].timestamp).getTime();
    return current - previous > TIMESTAMP_GAP_MS;
  }

  isRtl(text: string): boolean {
    if (!text) return false;
    return /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(text);
  }

  private scrollToBottom(): void {
    const el = this.chatContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }
}
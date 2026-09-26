// ai-component.component.ts
import {
  Component,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { AiService, AgentResponse, GraphData } from '../../ai-service.service';

// Register all Chart.js components
Chart.register(...registerables);

// ✅ Define ChatMessage interface here
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  graph?: GraphData;
}

@Component({
  selector: 'app-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-component.component.html',
  styleUrl: './ai-component.component.css'
})
export class AiComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  query = '';
  loading = false;
  error = '';

  // Chat history
  messages: ChatMessage[] = [];
  private chartInstance: Chart | null = null;
  private lastGraphMessage: ChatMessage | null = null;

  // Suggested prompts (empty state)
  suggestedPrompts: string[] = [
    'What is the occupancy rate today?',
    'Show me revenue for last month',
    'List unverified guests',
    'Which rooms need maintenance?'
  ];

  // Clear-history confirmation modal
  showClearConfirm = false;

  /** Only show a timestamp when >5 min have passed since the previous message. */
  private readonly TIMESTAMP_GAP_MS = 5 * 60 * 1000;

  constructor(private aiService: AiService) {}

  ngAfterViewInit(): void {
    this.loadHistory();
    setTimeout(() => this.scrollToBottom(), 0);
  }

  ngOnDestroy(): void {
    this.destroyChart();
    this.saveHistory();
  }

  /** Close the confirmation modal with Escape. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showClearConfirm) {
      this.showClearConfirm = false;
    }
  }

  // ------------------------------------------------------------
  // HISTORY
  // ------------------------------------------------------------
  private loadHistory(): void {
    try {
      const stored = localStorage.getItem('aiChatHistory');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.messages = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      }
    } catch (e) {
      console.warn('Failed to load chat history', e);
    }
    this.renderLastGraph();
  }

  private saveHistory(): void {
    try {
      localStorage.setItem('aiChatHistory', JSON.stringify(this.messages));
    } catch (e) {
      console.warn('Failed to save chat history', e);
    }
  }

  // ------------------------------------------------------------
  // CLEAR HISTORY (with confirmation)
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
    this.lastGraphMessage = null;
    localStorage.removeItem('aiChatHistory');
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
  // SEND QUERY
  // ------------------------------------------------------------
  ask(): void {
    if (this.loading) return;
    if (!this.query.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: this.query.trim(),
      timestamp: new Date()
    };
    this.messages.push(userMessage);
    this.saveHistory();

    const queryText = this.query.trim();
    this.query = '';
    this.loading = true;
    this.error = '';
    this.destroyChart();

    this.aiService.ask(queryText).subscribe({
      next: (res) => {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: res.textSummary,
          timestamp: new Date(),
          graph: res.showGraph ? res.graph : undefined
        };
        this.messages.push(assistantMessage);
        this.saveHistory();
        this.loading = false;
        if (assistantMessage.graph) {
          this.lastGraphMessage = assistantMessage;
          this.renderChart(assistantMessage.graph);
        } else {
          this.lastGraphMessage = null;
        }
        this.scrollToBottom();
      },
      error: (err) => {
        this.error = 'Failed to get AI response: ' + err.message;
        this.loading = false;
        const errorMessage: ChatMessage = {
          role: 'assistant',
          content: '⚠️ Error: ' + err.message,
          timestamp: new Date()
        };
        this.messages.push(errorMessage);
        this.saveHistory();
        this.scrollToBottom();
        console.error(err);
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
        borderColor: '#5AA454',
        borderWidth: 1
      }))
    };

    let type: 'bar' | 'pie' | 'line' = 'bar';
    if (graph.type === 'PIE') type = 'pie';
    else if (graph.type === 'LINE') type = 'line';

    this.destroyChart();
    this.chartInstance = new Chart(ctx, {
      type: type,
      data: chartData,
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: graph.title || '' },
          legend: { display: graph.datasets.length > 0 }
        }
      }
    });
  }

  private renderLastGraph(): void {
    const last = this.messages
      .slice()
      .reverse()
      .find(m => m.role === 'assistant' && m.graph);
    if (last) {
      this.lastGraphMessage = last;
      setTimeout(() => this.renderChart(last.graph!), 100);
    }
  }

  private destroyChart(): void {
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }
  }

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------
  private getColors(numDatasets: number, numLabels: number): string[] {
    const presetColors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
      '#FF9F40', '#FF6384', '#C9CBCF', '#FFB1C1', '#9AD0F5'
    ];
    if (numDatasets === 1 && numLabels > 0) {
      return presetColors.slice(0, numLabels);
    }
    return presetColors.slice(0, numDatasets);
  }

  /**
   * Show a timestamp only for the first message or when more than
   * TIMESTAMP_GAP_MS has elapsed since the previous message.
   */
  shouldShowTimestamp(index: number): boolean {
    if (index === 0) return true;

    const current = new Date(this.messages[index].timestamp).getTime();
    const previous = new Date(this.messages[index - 1].timestamp).getTime();

    return current - previous > this.TIMESTAMP_GAP_MS;
  }

  /** Detect RTL scripts (Arabic, Hebrew, etc.) so the bubble can flow correctly. */
  isRtl(text: string): boolean {
    if (!text) return false;
    const rtlPattern = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
    return rtlPattern.test(text);
  }

  private scrollToBottom(): void {
    const container = document.querySelector('.chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }
}
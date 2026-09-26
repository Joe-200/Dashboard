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
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Chart, registerables } from 'chart.js';
import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import { AiService, GraphData } from '../../ai-service.service';

Chart.register(...registerables);

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  graph?: GraphData;
}

const STORAGE_KEY = 'aiChatHistory';
const TIMESTAMP_GAP_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;

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
  private readonly markdownCache = new Map<string, SafeHtml>();

  readonly suggestedPrompts: string[] = [
    'What is the occupancy rate today?',
    'Show me revenue for last month',
    'List unverified guests',
    'Which rooms need maintenance?'
  ];

  showClearConfirm = false;

  private static markedConfigured = false;

  constructor(
    private readonly aiService: AiService,
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer
  ) {
    this.configureMarked();
  }

  // ------------------------------------------------------------
  // MARKED CONFIG
  // ------------------------------------------------------------
  private configureMarked(): void {
    if (AiComponent.markedConfigured) return;

    marked.setOptions({
      gfm: true,
      breaks: true
    });

    const renderer = new Renderer();

    /**
     * Fenced code block — supports marked v12+ (token object) AND legacy
     * (code, infostring) signatures. Renders a header bar with a language
     * label and a Copy button.
     */
    (renderer as any).code = (...args: any[]) => {
      let code = '';
      let language = '';

      if (args[0] && typeof args[0] === 'object' && 'text' in args[0]) {
        // marked v12+
        code = args[0].text ?? '';
        language = args[0].lang ?? '';
      } else {
        // legacy
        code = String(args[0] ?? '');
        language = String(args[1] ?? '');
      }

      const lang = language.trim().split(/\s+/)[0] || '';
      const label = lang || 'code';
      const langClass = lang ? ` class="language-${this.escapeHtml(lang)}"` : '';
      const escaped = this.escapeHtml(code);

      return [
        '<div class="md-code-block">',
          '<div class="md-code-header">',
            `<span class="md-code-lang">${this.escapeHtml(label)}</span>`,
            '<button type="button" class="md-copy-btn" aria-label="Copy code">Copy</button>',
          '</div>',
          `<pre><code${langClass}>${escaped}</code></pre>`,
        '</div>'
      ].join('');
    };

    // Force external links to open safely in a new tab.
    (renderer as any).link = (...args: any[]) => {
      let href = '';
      let title: string | null | undefined = null;
      let text = '';

      if (args[0] && typeof args[0] === 'object' && 'href' in args[0]) {
        href = args[0].href ?? '';
        title = args[0].title;
        text = args[0].text ?? '';
      } else {
        href = String(args[0] ?? '');
        title = args[1];
        text = String(args[2] ?? '');
      }

      const safeHref = this.escapeHtml(href || '#');
      const safeTitle = title ? ` title="${this.escapeHtml(title)}"` : '';
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${safeTitle}>${text}</a>`;
    };

    marked.use({ renderer });
    AiComponent.markedConfigured = true;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------
  // MARKDOWN → SafeHtml (cached)
  // ------------------------------------------------------------
  renderMarkdown(text: string): SafeHtml {
    if (!text) return '';

    const cached = this.markdownCache.get(text);
    if (cached) return cached;

    // Force SYNC parse — guaranteed to return a string, not a Promise.
    const raw = marked.parse(text, { async: false }) as string;

    const clean = DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'p', 'br', 'hr',
        'strong', 'em', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
        'code', 'pre', 'kbd', 'samp',
        'blockquote',
        'ul', 'ol', 'li',
        'a', 'img',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
        'div', 'span', 'button', 'input'
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel', 'class', 'type', 'aria-label',
        'align', 'colspan', 'rowspan', 'src', 'alt',
        'checked', 'disabled'
      ],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
    });

    const safe = this.sanitizer.bypassSecurityTrustHtml(clean);
    this.markdownCache.set(text, safe);
    return safe;
  }

  // ------------------------------------------------------------
  // COPY-CODE EVENT DELEGATION
  // ------------------------------------------------------------
  onMessageTextClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const btn = target.closest('.md-copy-btn') as HTMLButtonElement | null;
    if (!btn) return;

    const block = btn.closest('.md-code-block');
    const codeEl = block?.querySelector('pre code');
    if (!codeEl) return;

    const text = codeEl.textContent ?? '';

    const flash = (label: string, cls: string) => {
      btn.textContent = label;
      btn.classList.add(cls);
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove(cls);
      }, 1400);
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => flash('Copied!', 'copied'))
        .catch(() => flash('Failed', 'copy-error'));
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        flash('Copied!', 'copied');
      } catch {
        flash('Failed', 'copy-error');
      }
    }
  }

  // ------------------------------------------------------------
  // LIFECYCLE
  // ------------------------------------------------------------
  ngAfterViewInit(): void {
    this.loadHistory();
    this.cdr.detectChanges();
    // Give the DOM a beat to lay out restored messages, then snap to bottom.
    setTimeout(() => this.scrollToBottom(false, true), 50);
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
  // TRACKBY
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

      const parsed = JSON.parse(stored) as Array<
        Omit<ChatMessage, 'timestamp'> & { timestamp: string }
      >;
      this.messages = parsed.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));

      const lastWithGraph = [...this.messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.graph);

      if (lastWithGraph?.graph) {
        setTimeout(() => this.renderChart(lastWithGraph.graph!), 200);
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
  requestClearHistory(): void { this.showClearConfirm = true; }
  cancelClearHistory(): void  { this.showClearConfirm = false; }

  confirmClearHistory(): void {
    this.clearHistory();
    this.showClearConfirm = false;
  }

  clearHistory(): void {
    this.messages = [];
    this.markdownCache.clear();
    this.destroyChart();
    localStorage.removeItem(STORAGE_KEY);
    this.cdr.markForCheck();
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

    // User always wants to see their own message.
    this.cdr.markForCheck();
    requestAnimationFrame(() => this.scrollToBottom(true, true));

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
          setTimeout(() => this.renderChart(assistantMessage.graph!), 0);
        }

        this.cdr.markForCheck();

        // Let Angular paint the new bubble, then auto-scroll if the user
        // hasn't scrolled away. Second pass handles tall content (tables,
        // code blocks) that finishes laying out one tick later.
        requestAnimationFrame(() => {
          this.scrollToBottom(true);
          setTimeout(() => this.scrollToBottom(true), 80);
        });
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Failed to get AI response: ' + (err?.message ?? 'Unknown error');

        this.messages = [
          ...this.messages,
          {
            role: 'assistant',
            content: '⚠️ **Error:** ' + (err?.message ?? 'Unknown error'),
            timestamp: new Date()
          }
        ];
        this.saveHistory();
        this.cdr.markForCheck();
        requestAnimationFrame(() => this.scrollToBottom(true));
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

  // ------------------------------------------------------------
  // AUTO-SCROLL
  // ------------------------------------------------------------
  private isNearBottom(): boolean {
    const el = this.chatContainer?.nativeElement;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  /**
   * Scroll the chat container to the bottom.
   * - `smooth` : whether to animate.
   * - `force`  : scroll even if the user scrolled away.
   */
  private scrollToBottom(smooth: boolean, force = false): void {
    const el = this.chatContainer?.nativeElement;
    if (!el) return;
    if (!force && !this.isNearBottom()) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }
}
// Gráfico — cores lidas dos tokens de tokens.css, para acompanhar o tema sozinho.

import { weightDB } from './database.js';

/**
 * Lê um custom property do :root. getPropertyValue devolve a string com o
 * espaço à esquerda do valor, daí o trim(); `fallback` cobre o caso de a
 * folha de estilos ainda não ter carregado (ex.: primeira pintura offline).
 */
function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

/** Laranja do traço: --accent não muda entre temas (é preenchimento, não texto). */
function accent() {
    return token('--accent', '#f97316');
}

function accentFill() {
    return token('--accent-glow', 'rgba(249, 115, 22, 0.18)');
}

function getThemeColors() {
    const light = document.documentElement.dataset.theme === 'light';
    return {
        GRID: light ? 'rgba(0, 0, 0, 0.1)' : 'rgba(63, 63, 70, 0.6)',
        // Ticks e legenda são texto pequeno: --text-dim, não --text-faint (§2.3).
        TICK: token('--text-dim', light ? '#52525b' : '#a1a1aa'),
        // Borda do ponto = a superfície atrás dele, para o ponto "recortar" o traço.
        pointBorder: light ? '#ffffff' : token('--surface', '#161618'),
        tooltipBg: light ? 'rgba(255, 255, 255, 0.96)' : 'rgba(24, 24, 27, 0.95)',
        titleColor: token('--text', light ? '#18181b' : '#f4f4f5'),
        bodyColor: token('--text-dim', light ? '#52525b' : '#a1a1aa'),
        line: accent(),
        fill: accentFill(),
    };
}

class WeightChart {
    constructor(canvasId, { live = true } = {}) {
        this.canvasId = canvasId;
        this.chart = null;
        /** Datas completas (1 por ponto) para o título do tooltip. */
        this._fullLabels = [];
        /** Filtro de período ativo em dias (null = tudo). */
        this._rangeDays = null;
        /** Meta de peso (null = sem meta). */
        this._goal = null;
        /** false = gráfico read-only (perfil público): não lê os dados do próprio usuário. */
        this._live = live;
        this.init();
    }

    init() {
        this.createChart();
        if (this._live) this.updateChart();
    }

    /**
     * Renderiza uma série fornecida diretamente (perfil público read-only):
     * `points` = [{ t: ms, p: peso }] em ordem cronológica; `goal` = meta opcional.
     */
    renderPoints(points, goal = null) {
        if (!this.chart) return;
        const records = (points || [])
            .filter((pt) => pt && Number.isFinite(pt.t) && Number.isFinite(pt.p))
            .map((pt) => ({ timestamp: pt.t, peso: pt.p }));
        const { dados, labels, fullLabels } = weightDB.formatSeries(records);
        this.chart.data.labels = labels;
        this._fullLabels = fullLabels;
        this.chart.data.datasets[0].data = dados;
        this._goal = typeof goal === 'number' && Number.isFinite(goal) && goal > 0 ? goal : null;
        this.applyGoalDataset(dados.length);
        this.syncTheme();
        this.chart.update();
    }

    createChart() {
        const ctx = document.getElementById(this.canvasId).getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        const isNarrow = window.innerWidth < 768;
        const { GRID, TICK, pointBorder, tooltipBg, titleColor, bodyColor, line, fill } =
            getThemeColors();

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Peso (kg)',
                    data: [],
                    borderColor: line,
                    backgroundColor: fill,
                    tension: 0.35,
                    fill: true,
                    pointBackgroundColor: line,
                    pointBorderColor: pointBorder,
                    pointBorderWidth: 2,
                    pointRadius: isNarrow ? 3 : 4,
                    pointHoverRadius: 6,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                color: TICK,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            padding: 16,
                            usePointStyle: true,
                            color: TICK,
                            font: {
                                size: isNarrow ? 12 : 13,
                                family: "'Segoe UI', system-ui, sans-serif",
                            },
                        },
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: tooltipBg,
                        titleColor: titleColor,
                        bodyColor: bodyColor,
                        borderColor: line,
                        borderWidth: 1,
                        cornerRadius: 10,
                        displayColors: false,
                        callbacks: {
                            title: (items) => {
                                const i = items[0]?.dataIndex;
                                const full = this._fullLabels;
                                return (full && full[i]) || items[0]?.label || '';
                            },
                            label: (context) => {
                                const v = context.parsed.y;
                                const kg = `${Number(v).toFixed(1).replace('.', ',')} kg`;
                                return context.datasetIndex === 1 ? `Meta: ${kg}` : `Peso: ${kg}`;
                            }
                        }
                    },
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Peso (kg)',
                            color: TICK,
                            font: {
                                size: isNarrow ? 11 : 12,
                            },
                        },
                        grid: {
                            color: GRID,
                        },
                        ticks: {
                            color: TICK,
                            font: {
                                size: isNarrow ? 10 : 11,
                            },
                        },
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Período',
                            color: TICK,
                            font: {
                                size: isNarrow ? 11 : 12,
                            },
                        },
                        grid: {
                            color: GRID,
                        },
                        ticks: {
                            maxRotation: 0,
                            minRotation: 0,
                            autoSkip: true,
                            autoSkipPadding: 12,
                            color: TICK,
                            font: {
                                size: isNarrow ? 9 : 10,
                            },
                        },
                    },
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false,
                },
                layout: {
                    padding: {
                        top: 12,
                        right: 8,
                        bottom: 8,
                        left: 8,
                    },
                },
            },
        });
    }

    syncTheme() {
        if (!this.chart) return;
        const { GRID, TICK, pointBorder, tooltipBg, titleColor, bodyColor, line, fill } =
            getThemeColors();
        const ds = this.chart.data.datasets[0];
        ds.pointBorderColor = pointBorder;
        ds.borderColor = line;
        ds.backgroundColor = fill;
        ds.pointBackgroundColor = line;
        this.chart.options.color = TICK;
        const L = this.chart.options.plugins.legend.labels;
        L.color = TICK;
        const tip = this.chart.options.plugins.tooltip;
        tip.backgroundColor = tooltipBg;
        tip.titleColor = titleColor;
        tip.bodyColor = bodyColor;
        ['x', 'y'].forEach((axis) => {
            const sc = this.chart.options.scales[axis];
            if (!sc) return;
            if (sc.title) sc.title.color = TICK;
            if (sc.ticks) sc.ticks.color = TICK;
            if (sc.grid) sc.grid.color = GRID;
        });
    }

    async updateChart(rangeDays = this._rangeDays) {
        if (!this.chart) return;
        this._rangeDays = rangeDays ?? null;

        try {
            const { dados, labels, fullLabels } = await weightDB.getAllRecords(this._rangeDays);

            this.chart.data.labels = labels;
            this._fullLabels = fullLabels || labels;
            this.chart.data.datasets[0].data = dados;
            this.applyGoalDataset(labels.length);

            this.syncTheme();
            this.chart.update();
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
        }
    }

    refresh() {
        this.updateChart();
    }

    /** Define (ou remove, com null) a meta de peso desenhada como linha tracejada. */
    setGoal(value) {
        this._goal =
            typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
        if (!this.chart) return;
        this.applyGoalDataset(this.chart.data.labels.length);
        this.chart.update();
    }

    /** Garante/atualiza/remove o dataset da meta (linha horizontal). */
    applyGoalDataset(count) {
        if (!this.chart) return;
        const datasets = this.chart.data.datasets;

        if (this._goal && count > 0) {
            const data = new Array(count).fill(this._goal);
            if (datasets[1]) {
                datasets[1].data = data;
                datasets[1].borderColor = token('--accent-soft', '#fb923c');
            } else {
                datasets.push({
                    label: 'Meta',
                    data,
                    // Era verde-esmeralda, fora do sistema. O canvas do design
                    // desenha a meta em --accent-soft tracejado.
                    borderColor: token('--accent-soft', '#fb923c'),
                    borderDash: [6, 6],
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    fill: false,
                    tension: 0,
                });
            }
        } else if (datasets[1]) {
            datasets.splice(1, 1);
        }
    }

    /** Só cores (após mudar data-theme) */
    refreshTheme() {
        if (!this.chart) return;
        this.syncTheme();
        this.chart.update();
    }

    /** Esvazia o gráfico (ex.: ao terminar sessão) */
    clear() {
        if (!this.chart) return;
        this.chart.data.labels = [];
        this.chart.data.datasets[0].data = [];
        this.chart.update();
    }

    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    exportAsImage() {
        if (this.chart) {
            return this.chart.toBase64Image();
        }
        return null;
    }
}

export { WeightChart };

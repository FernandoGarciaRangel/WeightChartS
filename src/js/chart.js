// Módulo de gráficos
// Gerencia a criação e atualização dos gráficos

import { weightDB } from './database.js';

class WeightChart {
    constructor(canvasId) {
        this.canvasId = canvasId;
        this.chart = null;
        this.init();
    }

    init() {
        this.createChart();
        this.updateChart();
    }

    createChart() {
        const ctx = document.getElementById(this.canvasId).getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Peso (kg)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true,
                    pointBackgroundColor: 'rgb(75, 192, 192)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            font: {
                                size: window.innerWidth < 768 ? 12 : 14
                            }
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `Peso: ${context.parsed.y} kg`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Peso (kg)',
                            font: {
                                size: window.innerWidth < 768 ? 12 : 14
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Período',
                            font: {
                                size: window.innerWidth < 768 ? 12 : 14
                            }
                        },
                        grid: {
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 0,
                            font: {
                                size: window.innerWidth < 768 ? 10 : 12
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                },
                layout: {
                    padding: {
                        top: 20,
                        right: 20,
                        bottom: 20,
                        left: 20
                    }
                }
            }
        });
    }

    async updateChart() {
        if (!this.chart) return;

        try {
            const { dados, labels } = await weightDB.getAllRecords();
            
            this.chart.data.labels = labels;
            this.chart.data.datasets[0].data = dados;
            
            this.chart.update();
        } catch (error) {
            console.error('Erro ao atualizar gráfico:', error);
        }
    }

    // Atualizar gráfico com novos dados
    refresh() {
        this.updateChart();
    }

    // Destruir gráfico
    destroy() {
        if (this.chart) {
            this.chart.destroy();
            this.chart = null;
        }
    }

    // Exportar gráfico como imagem
    exportAsImage() {
        if (this.chart) {
            return this.chart.toBase64Image();
        }
        return null;
    }
}

// Exportar classe
export { WeightChart };

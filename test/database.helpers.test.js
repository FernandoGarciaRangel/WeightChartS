import { describe, it, expect } from 'vitest';
import {
    derivePeriodFromMillis,
    parseDataBrToMs,
    normalizeImportPeso,
    parseImportCsv,
    dayKeyFromTs,
    recordPeriodLabel,
    recordAxisLabels,
} from '../src/js/database.js';

// Meio-dia local evita saltos de dia por fuso.
const localNoon = (y, m, d) => new Date(y, m, d, 12, 0, 0, 0).getTime();

describe('derivePeriodFromMillis', () => {
    it('deriva mês (chave PT), semana e data legível', () => {
        const p = derivePeriodFromMillis(localNoon(2026, 5, 12)); // 12 de junho
        expect(p.mes).toBe('junho');
        expect(p.semana).toBe('2'); // ceil(12/7) = 2
        expect(p.data).toBe('12/06/2026');
    });

    it('mapeia os limites de semana (ceil(dia/7), teto em 4)', () => {
        expect(derivePeriodFromMillis(localNoon(2026, 0, 7)).semana).toBe('1'); // dia 7
        expect(derivePeriodFromMillis(localNoon(2026, 0, 8)).semana).toBe('2'); // dia 8
        expect(derivePeriodFromMillis(localNoon(2026, 0, 28)).semana).toBe('4');
        expect(derivePeriodFromMillis(localNoon(2026, 0, 31)).semana).toBe('4'); // teto
    });
});

describe('parseDataBrToMs', () => {
    it('faz round-trip com derivePeriodFromMillis', () => {
        const ms = parseDataBrToMs('12/06/2026');
        expect(ms).not.toBeNull();
        expect(derivePeriodFromMillis(ms).data).toBe('12/06/2026');
    });

    it('aceita dígitos únicos', () => {
        expect(parseDataBrToMs('1/1/2026')).not.toBeNull();
    });

    it('rejeita datas impossíveis', () => {
        expect(parseDataBrToMs('31/02/2026')).toBeNull(); // fevereiro não tem 31
        expect(parseDataBrToMs('12/13/2026')).toBeNull(); // mês 13
        expect(parseDataBrToMs('00/06/2026')).toBeNull(); // dia 0
        expect(parseDataBrToMs('abc')).toBeNull();
        expect(parseDataBrToMs('2026-06-12')).toBeNull(); // formato errado
    });

    it('respeita anos bissextos', () => {
        expect(parseDataBrToMs('29/02/2024')).not.toBeNull(); // 2024 bissexto
        expect(parseDataBrToMs('29/02/2025')).toBeNull(); // 2025 não
    });
});

describe('normalizeImportPeso', () => {
    it('aceita número, vírgula e ponto decimal', () => {
        expect(normalizeImportPeso(80)).toBe(80);
        expect(normalizeImportPeso('80,5')).toBe(80.5);
        expect(normalizeImportPeso('80.5')).toBe(80.5);
    });

    it('devolve NaN para entradas inválidas', () => {
        expect(Number.isNaN(normalizeImportPeso('abc'))).toBe(true);
        expect(Number.isNaN(normalizeImportPeso(null))).toBe(true);
    });
});

describe('dayKeyFromTs', () => {
    it('gera YYYY-MM-DD no fuso local a partir de ms', () => {
        expect(dayKeyFromTs(localNoon(2026, 0, 5))).toBe('2026-01-05');
    });

    it('aceita Timestamp do Firestore (toMillis / seconds)', () => {
        const ms = localNoon(2026, 0, 5);
        expect(dayKeyFromTs({ toMillis: () => ms })).toBe('2026-01-05');
        expect(dayKeyFromTs({ seconds: Math.floor(ms / 1000) })).toBe('2026-01-05');
    });

    it('devolve null para entrada inválida', () => {
        expect(dayKeyFromTs(null)).toBeNull();
        expect(dayKeyFromTs(undefined)).toBeNull();
    });
});

describe('parseImportCsv', () => {
    it('pula o cabeçalho e agrupa por mês/semana', () => {
        const out = parseImportCsv('data;peso\n12/06/2026;80,5\n13/06/2026;81');
        expect(out.junho['2']).toHaveLength(2);
        expect(out.junho['2'][0].peso).toBe(80.5);
    });

    it('aceita separador vírgula além de ponto-e-vírgula', () => {
        const out = parseImportCsv('05/01/2026,90');
        expect(out.janeiro['1'][0].peso).toBe(90);
    });

    it('deduplica por dia (última ocorrência vence)', () => {
        const out = parseImportCsv('12/06/2026;80\n12/06/2026;82');
        expect(out.junho['2']).toHaveLength(1);
        expect(out.junho['2'][0].peso).toBe(82);
    });

    it('lança em CSV vazio, data inválida e peso fora de faixa', () => {
        expect(() => parseImportCsv('')).toThrow();
        expect(() => parseImportCsv('99/99/2026;80')).toThrow(/Data inválida/);
        expect(() => parseImportCsv('12/06/2026;999')).toThrow(/Peso inválido/);
        expect(() => parseImportCsv('12/06/2026')).toThrow(); // sem coluna de peso
    });
});

describe('recordPeriodLabel', () => {
    it('prioriza o timestamp real', () => {
        expect(recordPeriodLabel({ timestamp: localNoon(2026, 5, 12) })).toBe(
            'Junho de 2026 · Semana 2',
        );
    });

    it('recai em mes/semana quando não há timestamp', () => {
        expect(recordPeriodLabel({ mes: 'junho', semana: '2' })).toBe('Junho · Semana 2');
    });
});

describe('recordAxisLabels', () => {
    it('omite o ano no rótulo curto quando é o ano atual', () => {
        const anoAtual = new Date().getFullYear();
        const { short, full } = recordAxisLabels({ timestamp: localNoon(anoAtual, 5, 12) });
        expect(short).toBe('12 jun');
        expect(full).toContain('12 de junho');
        expect(full).toContain(String(anoAtual));
    });

    it('inclui o ano abreviado quando é outro ano', () => {
        const outroAno = new Date().getFullYear() - 2;
        const { short } = recordAxisLabels({ timestamp: localNoon(outroAno, 5, 12) });
        expect(short).toBe(`12 jun ${String(outroAno).slice(2)}`);
    });
});

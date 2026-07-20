import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // jsdom fornece window/document/localStorage — necessários para instanciar
        // WeightDatabase e para o código acoplado ao DOM.
        environment: 'jsdom',
        globals: true,
        include: ['test/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['src/js/**/*.js', 'src/config/**/*.js'],
            reporter: ['text', 'html'],
        },
    },
});

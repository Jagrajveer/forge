import { defineConfig } from "vitest/config";
export default defineConfig({
    test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        exclude: ["node_modules", "dist"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            exclude: [
                "src/**/*.test.ts",
                "src/**/*.d.ts",
                "src/**/__tests__/**",
                "dist/**"
            ],
            thresholds: {
                global: {
                    branches: 80,
                    functions: 80,
                    lines: 80,
                    statements: 80
                }
            }
        }
    },
    resolve: {
        alias: {
            "@": "./src"
        }
    }
});

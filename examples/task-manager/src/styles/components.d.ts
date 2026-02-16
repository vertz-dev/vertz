/**
 * Shared component styles using css() and variants().
 *
 * These demonstrate the compile-time CSS API with shorthand syntax
 * and the typed variant system.
 */
export declare const layoutStyles: import("@vertz/ui").CSSOutput;
export declare const button: import("@vertz/ui").VariantFunction<{
    intent: {
        primary: string[];
        secondary: string[];
        danger: string[];
        ghost: string[];
    };
    size: {
        sm: string[];
        md: string[];
        lg: string[];
    };
}>;
export declare const badge: import("@vertz/ui").VariantFunction<{
    color: {
        blue: string[];
        green: string[];
        yellow: string[];
        red: string[];
        gray: string[];
    };
}>;
export declare const cardStyles: import("@vertz/ui").CSSOutput;
export declare const formStyles: import("@vertz/ui").CSSOutput;
export declare const emptyStateStyles: import("@vertz/ui").CSSOutput;
//# sourceMappingURL=components.d.ts.map
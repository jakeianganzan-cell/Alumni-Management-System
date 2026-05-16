import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    trend?: "up" | "down" | "neutral";
    trendValue?: string;
    variant?: "navy" | "gold" | "white" | "success" | "warning";
    subtitle?: string;
}

export function StatCard({ title, value, icon: Icon, trend, trendValue, variant = "white", subtitle }: StatCardProps) {
    const variantStyles = {
        navy: "bg-navy text-white",
        gold: "bg-gold text-navy-dark",
        white: "bg-card text-foreground border border-border shadow-card",
        success: "bg-card text-foreground border border-border shadow-card",
        warning: "bg-card text-foreground border border-border shadow-card",
    };

    const iconStyles = {
        navy: "bg-white/15 text-white",
        gold: "bg-navy/15 text-navy-dark",
        white: "bg-navy/10 text-navy",
        success: "bg-emerald-100 text-emerald-700",
        warning: "bg-amber-100 text-amber-700",
    };

    const trendStyles = {
        up: "text-emerald-500",
        down: "text-rose-500",
        neutral: "text-muted-foreground",
    };

    const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

    return (
        <div className={`animate-scale-in rounded-xl p-4 transition-all duration-200 hover:scale-[1.01] sm:p-5 ${variantStyles[variant]}`}>
            <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconStyles[variant]}`}>
                    <Icon className="w-5 h-5" />
                </div>
                {trend && trendValue && (
                    <div className={`flex items-center gap-1 text-xs font-semibold ${trendStyles[trend]}`}>
                        <TrendIcon className="w-3 h-3" />
                        {trendValue}
                    </div>
                )}
            </div>
            <p className={`mb-0.5 font-display text-xl font-bold sm:text-2xl ${variant === "navy" ? "text-white" : variant === "gold" ? "text-navy-dark" : "text-navy-dark"}`}>
                {value}
            </p>
            <p className={`text-xs font-medium ${variant === "navy" ? "text-white/70" : variant === "gold" ? "text-navy/70" : "text-muted-foreground"}`}>
                {title}
            </p>
            {subtitle && (
                <p className={`text-xs mt-1 ${variant === "navy" ? "text-white/50" : "text-muted-foreground"}`}>{subtitle}</p>
            )}
        </div>
    );
}

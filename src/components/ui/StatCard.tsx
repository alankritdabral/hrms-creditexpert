import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon: React.ReactNode;
  color?: "indigo" | "emerald" | "amber" | "rose" | "sky" | "purple";
}

export function StatCard({
  title,
  value,
  subtitle,
  change,
  trend,
  icon,
  color = "indigo",
}: StatCardProps) {
  const iconBg = {
    indigo: "bg-blue-50 text-blue-600 border border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border border-amber-100",
    rose: "bg-rose-50 text-rose-600 border border-rose-100",
    sky: "bg-sky-50 text-sky-600 border border-sky-100",
    purple: "bg-purple-50 text-purple-600 border border-purple-100",
  }[color];

  return (
    <div
      className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs hover:shadow-md hover:border-blue-200 transition-all duration-200 relative overflow-hidden group"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500 tracking-wide uppercase truncate">{title}</p>
        <div className={`p-2 sm:p-2.5 rounded-xl ${iconBg} transition-transform group-hover:scale-110 duration-200 shrink-0`}>
          {icon}
        </div>
      </div>
      <div className="mt-3 sm:mt-4">
        <h4 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">{value}</h4>
        {(subtitle || change) && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1.5 text-xs">
            {change && (
              <span
                className={`font-semibold shrink-0 ${
                  trend === "up"
                    ? "text-emerald-600"
                    : trend === "down"
                    ? "text-rose-600"
                    : "text-slate-500"
                }`}
              >
                {change}
              </span>
            )}
            {subtitle && <span className="text-slate-500 truncate">{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

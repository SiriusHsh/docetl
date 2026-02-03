"use client";

import { Fragment, useMemo } from "react";
import type { CSSProperties } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";

type ToneKey = "quantity" | "efficiency" | "result";

const THEME_STYLE = {
  "--tone-quantity": "210 86% 45%",
  "--tone-efficiency": "152 52% 36%",
  "--tone-result": "28 92% 55%",
  "--tone-surface": "210 30% 98%",
} as CSSProperties;

const quantityTrend = [
  { day: "01-08", raw: 280, cleaned: 210, output: 180, hq: 120 },
  { day: "01-10", raw: 300, cleaned: 226, output: 195, hq: 131 },
  { day: "01-12", raw: 320, cleaned: 240, output: 205, hq: 140 },
  { day: "01-14", raw: 310, cleaned: 238, output: 198, hq: 136 },
  { day: "01-16", raw: 330, cleaned: 252, output: 210, hq: 150 },
  { day: "01-18", raw: 350, cleaned: 268, output: 228, hq: 166 },
  { day: "01-20", raw: 360, cleaned: 275, output: 234, hq: 172 },
];

const monthlySummaryTrend = [
  { month: "2026-01", raw: 0, hq: 0 },
  { month: "2026-02", raw: 210, hq: 90 },
  { month: "2026-03", raw: 250, hq: 110 },
  { month: "2026-04", raw: 280, hq: 125 },
  { month: "2026-05", raw: 320, hq: 150 },
  { month: "2026-06", raw: 350, hq: 170 },
];

const pipelineLevels = [
  { name: "数据蒸馏", L1: 52, L2: 78, L3: 90, L4: 60, L5: 30 },
  { name: "数据合成", L1: 40, L2: 64, L3: 82, L4: 68, L5: 42 },
  { name: "数据泛化", L1: 46, L2: 70, L3: 88, L4: 62, L5: 35 },
  { name: "数据转化", L1: 34, L2: 55, L3: 76, L4: 58, L5: 28 },
  { name: "人工创建", L1: 28, L2: 48, L3: 66, L4: 52, L5: 22 },
];

const qualityDistribution = [
  { bucket: "0.6-0.7", value: 18 },
  { bucket: "0.7-0.75", value: 26 },
  { bucket: "0.75-0.8", value: 38 },
  { bucket: "0.8-0.85", value: 52 },
  { bucket: "0.85-0.9", value: 44 },
  { bucket: "0.9+", value: 32 },
];

const efficiencyTrend = [
  { day: "01-08", freshness: 3.4, latency: 12.1 },
  { day: "01-10", freshness: 3.1, latency: 11.4 },
  { day: "01-12", freshness: 2.9, latency: 10.8 },
  { day: "01-14", freshness: 2.7, latency: 10.2 },
  { day: "01-16", freshness: 2.6, latency: 9.7 },
  { day: "01-18", freshness: 2.5, latency: 9.5 },
  { day: "01-20", freshness: 2.4, latency: 9.2 },
];

const throughputTrend = [
  { day: "01-08", value: 46 },
  { day: "01-10", value: 48 },
  { day: "01-12", value: 55 },
  { day: "01-14", value: 52 },
  { day: "01-16", value: 58 },
  { day: "01-18", value: 63 },
  { day: "01-20", value: 66 },
];

const interceptReasons = [
  { name: "字段缺失", value: 182 },
  { name: "噪声过高", value: 144 },
  { name: "重复样本", value: 118 },
  { name: "冲突标签", value: 74 },
  { name: "异常长度", value: 62 },
];

const qualityTrend = [
  { day: "01-08", hq: 52, mid: 33, low: 15 },
  { day: "01-10", hq: 55, mid: 31, low: 14 },
  { day: "01-12", hq: 58, mid: 29, low: 13 },
  { day: "01-14", hq: 60, mid: 28, low: 12 },
  { day: "01-16", hq: 62, mid: 27, low: 11 },
  { day: "01-18", hq: 63, mid: 26, low: 11 },
  { day: "01-20", hq: 64, mid: 26, low: 10 },
];

const QUICK_METRICS = [
  { label: "流水线条数", value: "10", note: "已登记流水线" },
  { label: "流水线执行次数", value: "124", note: "近7天" },
  { label: "数据清洗量", value: "2.71M", note: "规则版本 v2.4" },
  { label: "投入产出比", value: "0.79", note: "输出/输入" },
  { label: "进入训练池", value: "920K", note: "近7天" },
];

const benchmarkDelta = [
  { name: "意图识别", value: 3.2 },
  { name: "长文摘要", value: 2.4 },
  { name: "结构抽取", value: 4.1 },
  { name: "多轮对话", value: 3.6 },
];

const toneClass: Record<ToneKey, string> = {
  quantity: "text-[hsl(var(--tone-quantity))]",
  efficiency: "text-[hsl(var(--tone-efficiency))]",
  result: "text-[hsl(var(--tone-result))]",
};

const efficiencyStages = [
  { label: "数据获取", detail: "采集与校验", hours: 6.5 },
  { label: "数据生成", detail: "清洗与生成", hours: 10.2 },
  { label: "模型训练", detail: "微调与评测", hours: 22.8 },
  { label: "推理上线", detail: "推理入池", hours: 4.3 },
];

function SectionHeader({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: ToneKey;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div
          className={cn(
            "text-xs font-semibold uppercase tracking-[0.24em]",
            toneClass[tone]
          )}
        >
          {title}
        </div>
        <div className="mt-1.5 text-xl font-semibold text-slate-900">
          {description}
        </div>
      </div>
      <div className="hidden items-center gap-2 rounded-full border border-white/40 bg-white/70 px-3 py-1 text-xs text-slate-500 shadow-sm sm:flex">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        实时同步至训练池
      </div>
    </div>
  );
}

function SummaryLineCard({
  title,
  value,
  dataKey,
  stroke,
  gradientId,
}: {
  title: string;
  value: string;
  dataKey: "raw" | "hq";
  stroke: string;
  gradientId: string;
}) {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
        {title}
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900">{value}</div>
      <div className="mt-5 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlySummaryTrend} margin={{ left: -8, right: 12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="95%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94a3b8" />
            <YAxis
              domain={[0, "auto"]}
              tick={{ fontSize: 10 }}
              stroke="#94a3b8"
              width={32}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={stroke}
              fill={`url(#${gradientId})`}
              strokeWidth={2}
              dot={{ r: 3.5, stroke, strokeWidth: 2, fill: "#ffffff" }}
              activeDot={{ r: 4.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MiniMetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function EfficiencyFlow() {
  const totalHours = efficiencyStages.reduce((sum, item) => sum + item.hours, 0);
  const bottleneck = efficiencyStages.reduce((prev, item) =>
    item.hours > prev.hours ? item : prev
  );
  const totalDays = totalHours / 24;

  return (
    <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
            数据新鲜度链路
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">
            端到端耗时 {totalDays.toFixed(1)} 天
          </div>
        </div>
        {/* average freshness badge removed */}
      </div>

      <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center">
        {efficiencyStages.flatMap((stage, index) => {
          const percent = Math.round((stage.hours / totalHours) * 100);
          const isBottleneck = stage.label === bottleneck.label;
          const items = [
            <div
              key={`${stage.label}-card`}
              className={cn(
                "w-full min-h-[200px] rounded-2xl border bg-white/90 p-5 shadow-sm lg:flex-1",
                isBottleneck
                  ? "border-amber-200 bg-amber-50/40"
                  : "border-slate-100"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {stage.label}
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  {percent}%
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">{stage.detail}</div>
              <div className="mt-4 text-3xl font-semibold text-slate-900">
                {stage.hours}h
              </div>
              <div className="mt-4 h-2 rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-2 rounded-full",
                    isBottleneck ? "bg-amber-400" : "bg-emerald-400"
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>,
          ];

          if (index < efficiencyStages.length - 1) {
            items.push(
              <div
                key={`${stage.label}-connector`}
                className="hidden h-12 w-16 items-center lg:flex"
              >
                <div className="h-1 w-full rounded-full bg-slate-200">
                  <div className="flow-line h-1 w-full rounded-full" />
                </div>
              </div>
            );
          }

          return items;
        })}
      </div>
    </div>
  );
}

export default function DataMetricsPage() {
  const numberFormat = useMemo(() => new Intl.NumberFormat("zh-CN"), []);
  const pipelineOutputData = useMemo(() => {
    return pipelineLevels
      .map((row) => {
        const L12 = row.L1 + row.L2;
        const L34 = row.L3 + row.L4;
        const L5 = row.L5;
        return {
          name: row.name,
          L12,
          L34,
          L5,
          total: L12 + L34 + L5,
        };
      })
      .sort((a, b) => b.total - a.total);
  }, []);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-slate-50"
      style={THEME_STYLE}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-[-120px] top-24 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="absolute bottom-[-140px] left-1/3 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl" />
      </div>

      <div
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              端到端数据指标可视化
            </h1>
            <p className="max-w-2xl text-sm text-slate-600">
              从数量、效率、结果三维度反向拆解目标，追踪数据清洗、质量筛选与训练池落地的全链路表现。
            </p>
          </div>
        </header>

        <SectionHeader title="数量" description="规模结构与质量分布" tone="quantity" />

        <section
          className="animate-slide-in space-y-4"
          style={{ animationDelay: "0.1s" }}
        >
          <div className="grid gap-4 lg:grid-cols-[1.05fr_1.05fr_1.2fr]">
            <SummaryLineCard
              title="输入原始样本总数"
              value="3.42M"
              dataKey="raw"
              stroke="#38bdf8"
              gradientId="rawSummaryFill"
            />
            <SummaryLineCard
              title="产出高质量数据总数"
              value="1.18M"
              dataKey="hq"
              stroke="#f59e0b"
              gradientId="hqSummaryFill"
            />
            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
                    数据生成分布
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    L1/L2
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    L3/L4
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    L5
                  </span>
                </div>
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pipelineOutputData}
                    layout="vertical"
                    margin={{ left: 12, right: 16 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      width={70}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                    />
                    <Bar dataKey="L12" stackId="a" fill="#93c5fd">
                      <LabelList
                        dataKey="L12"
                        position="center"
                        fill="#ffffff"
                        fontSize={10}
                      />
                    </Bar>
                    <Bar dataKey="L34" stackId="a" fill="#6ee7b7">
                      <LabelList
                        dataKey="L34"
                        position="center"
                        fill="#ffffff"
                        fontSize={10}
                      />
                    </Bar>
                    <Bar dataKey="L5" stackId="a" fill="#fbbf24">
                      <LabelList
                        dataKey="L5"
                        position="center"
                        fill="#ffffff"
                        fontSize={10}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {QUICK_METRICS.map((metric) => (
              <MiniMetricCard key={metric.label} {...metric} />
            ))}
          </div>
        </section>

        {/* 端到端链路区域暂不展示 */}

        <section className="space-y-5">
          <SectionHeader title="效率" description="新鲜度与执行效率" tone="efficiency" />
          <EfficiencyFlow />
        </section>

        <section className="space-y-5">
          <SectionHeader title="结果" description="高质量沉淀与效果验证" tone="result" />
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
              <div className="text-lg font-semibold text-slate-900">质量结构趋势</div>
              <div className="text-xs text-slate-500">高/中/低质量占比</div>
              <div className="mt-4 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={qualityTrend} margin={{ left: -12, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Area type="monotone" dataKey="hq" stackId="1" stroke="#34d399" fill="#34d399" />
                    <Area type="monotone" dataKey="mid" stackId="1" stroke="#fbbf24" fill="#fbbf24" />
                    <Area type="monotone" dataKey="low" stackId="1" stroke="#fca5a5" fill="#fca5a5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
              <div className="text-lg font-semibold text-slate-900">规则拦截原因</div>
              <div className="text-xs text-slate-500">Top 5 原因</div>
              <div className="mt-4 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={interceptReasons} margin={{ left: -12, right: 16 }} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 10 }}
                      stroke="#94a3b8"
                      width={72}
                    />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Bar dataKey="value" fill="#f97316" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 text-xs text-slate-500">
                规则总数：128 / 启用：94
              </div>
            </div>

            <div className="rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur">
              <div className="text-lg font-semibold text-slate-900">Benchmark 提升</div>
              <div className="text-xs text-slate-500">对比基线 v0.31</div>
              <div className="mt-4 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={benchmarkDelta} margin={{ left: -12, right: 16 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                    <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }} />
                    <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>训练池样本：{numberFormat.format(920000)}</span>
                <span>质量阈值：0.82</span>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

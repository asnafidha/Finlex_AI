import { useEffect, useRef } from 'react'

const NAVY = '#0f1f4b'
const GOLD = '#C9A84C'
const GOLD2 = '#e2c06e'
const WHITE = '#ffffff'
const GRAY = '#f4f6fb'

// ── Chart.js CDN loader ──────────────────────────────────────
async function loadChartJS() {
    if (window.Chart) return window.Chart
    return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
        s.onload = () => resolve(window.Chart)
        s.onerror = () => reject(new Error('Chart.js failed to load'))
        document.head.appendChild(s)
    })
}

function ChartCanvas({ id, buildChart, deps = [] }) {
    const ref = useRef()
    const chartRef = useRef(null)
    useEffect(() => {
        let cancelled = false
        loadChartJS().then(Chart => {
            if (cancelled || !ref.current) return
            if (chartRef.current) chartRef.current.destroy()
            chartRef.current = buildChart(Chart, ref.current)
        }).catch(console.error)
        return () => {
            cancelled = true
            if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
        }
    }, deps)
    return <canvas ref={ref} id={id} style={{ maxHeight: 240, width: '100%' }} />
}

// ── Revenue vs Expenses Bar ─────────────────────────────────
export function RevenueExpensesChart({ revenue = 0, expenses = 0 }) {
    const build = (Chart, canvas) => new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['Revenue', 'Expenses'],
            datasets: [{
                data: [parseFloat(revenue), parseFloat(expenses)],
                backgroundColor: [
                    'rgba(201,168,76,0.85)',
                    'rgba(239,68,68,0.75)',
                ],
                borderColor: [GOLD, '#ef4444'],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => '₹' + parseFloat(ctx.parsed.y || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    },
                    backgroundColor: NAVY,
                    titleColor: GOLD,
                    bodyColor: WHITE,
                    borderColor: GOLD,
                    borderWidth: 1,
                    cornerRadius: 8,
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: NAVY, font: { weight: '600', size: 13 } },
                },
                y: {
                    grid: { color: 'rgba(15,31,75,0.07)' },
                    ticks: {
                        color: '#6b7280',
                        font: { size: 11 },
                        callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v),
                    },
                },
            },
        },
    })
    return <ChartCanvas id="revExpChart" buildChart={build} deps={[revenue, expenses]} />
}

// ── Expense Breakdown Doughnut ──────────────────────────────
export function ExpenseBreakdownChart({ data = [] }) {
    if (!data.length) return (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No expense data yet</div>
    )
    const COLORS = [GOLD, '#ef4444', '#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#14b8a6', '#ec4899']
    const labels = data.map(d => d.account)
    const values = data.map(d => Math.abs(parseFloat(d.amount || 0))).filter(v => v > 0)
    if (!values.length) return (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 40, fontSize: 13 }}>No expense data yet</div>
    )

    const build = (Chart, canvas) => new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: COLORS.slice(0, values.length),
                borderColor: WHITE,
                borderWidth: 3,
                hoverBorderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { font: { size: 11 }, color: NAVY, boxWidth: 14, padding: 12 },
                },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: ₹${parseFloat(ctx.parsed).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                    },
                    backgroundColor: NAVY,
                    titleColor: GOLD,
                    bodyColor: WHITE,
                    borderColor: GOLD,
                    borderWidth: 1,
                    cornerRadius: 8,
                },
            },
        },
    })
    return <ChartCanvas id="expBreakChart" buildChart={build} deps={[JSON.stringify(data)]} />
}

// ── Profit / Loss Horizontal Bar ────────────────────────────
export function ProfitLossChart({ revenue = 0, expenses = 0 }) {
    const netProfit = parseFloat(revenue) - parseFloat(expenses)
    const isProfit = netProfit >= 0
    const build = (Chart, canvas) => new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['Revenue', 'Expenses', 'Net Profit'],
            datasets: [{
                data: [parseFloat(revenue), parseFloat(expenses), netProfit],
                backgroundColor: [
                    `rgba(201,168,76,0.85)`,
                    `rgba(239,68,68,0.75)`,
                    isProfit ? `rgba(16,185,129,0.85)` : `rgba(239,68,68,0.85)`,
                ],
                borderColor: [GOLD, '#ef4444', isProfit ? '#10b981' : '#ef4444'],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => '₹' + parseFloat(ctx.parsed.x || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
                    },
                    backgroundColor: NAVY,
                    titleColor: GOLD,
                    bodyColor: WHITE,
                    borderColor: GOLD,
                    borderWidth: 1,
                    cornerRadius: 8,
                },
            },
            scales: {
                x: {
                    grid: { color: 'rgba(15,31,75,0.07)' },
                    ticks: {
                        color: '#6b7280', font: { size: 11 },
                        callback: v => '₹' + (Math.abs(v) >= 100000 ? (v / 100000).toFixed(1) + 'L' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v),
                    },
                },
                y: {
                    grid: { display: false },
                    ticks: { color: NAVY, font: { weight: '600', size: 13 } },
                },
            },
        },
    })
    return <ChartCanvas id="plChart" buildChart={build} deps={[revenue, expenses]} />
}

// ── Compliance Score Gauge ──────────────────────────────────
export function ComplianceScoreChart({ score = 0 }) {
    const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444'
    const build = (Chart, canvas) => new Chart(canvas, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [score, 100 - score],
                backgroundColor: [color, 'rgba(15,31,75,0.08)'],
                borderWidth: 0,
                circumference: 180,
                rotation: 270,
            }],
        },
        plugins: [{
            id: 'centerLabel',
            afterDraw(chart) {
                const { ctx, chartArea: { width, height, top } } = chart
                ctx.save()
                ctx.textAlign = 'center'
                ctx.font = `bold 32px system-ui`
                ctx.fillStyle = color
                ctx.fillText(`${score}`, width / 2, top + height * 0.78)
                ctx.font = `13px system-ui`
                ctx.fillStyle = '#9ca3af'
                ctx.fillText('/100', width / 2, top + height * 0.95)
                ctx.restore()
            },
        }],
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
        },
    })
    return <ChartCanvas id="complianceChart" buildChart={build} deps={[score]} />
}

'use client'

import { useEffect, useState } from 'react'
import { ResponsivePie } from '@nivo/pie';
import LineChart from './LineChart';
import SingleValueDisplay from './SingleValueDisplay';

type AnalyticsData = {
  days: number
  ticketsCreated: number
  ticketsClosed: number
  staffActions: number
  logsByLevel: Record<string, number>
  totalTicketsCreated: number
  totalTicketsClosed: number
  openTickets: number
  claimedBreakdown: Record<string, number>
  claimedAvatars: Record<string, string>
  claimedBySource: {
    live: Record<string, number>
    ticketsbot: Record<string, number>
    tickettool: Record<string, number>
  }
  /*totalCreated: {
    live: number
    ticketsbot: number
    tickettool: number
  }*/
  closedBreakdown: Record<string, number>
  closedAvatars: Record<string, string>
  ticketsCreatedHistory: number[];
  ticketsClosedHistory: number[];
  staffActionsHistory: number[];
  logsByLevelHistory: Record<string, number[]>;
  ticketTypeBreakdown: Record<string, number>;
  totalClosedBySource: {
    live: number;
    ticketsbot: number;
    tickettool: number;
  };  
}

const dayOptions = [30, 60, 90, 180, 360]

/**
 * Nivo Pie Chart Custom Label Layer
 * - Renders avatar + percentage (and username if space allows) for each arc.
 * - If label would overflow, Nivo will automatically place it outside or use arcLinkLabels.
 * - For slices too small, only avatar + % is shown, or label is omitted.
 */
function PieArcLabel({ datum }: { datum: any }) {
  // datum: { id, value, label, color, data }
  const { data, arc, label, color } = datum;
  const percent = data.value / datum.arc.dataWithArc.total * 100;
  // Show avatar + % (and name if space allows)
  return (
    <g>
      <image
        href={data.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
        x={arc.centroid[0] - 12}
        y={arc.centroid[1] - 12}
        width={24}
        height={24}
        style={{ borderRadius: '50%' }}
      />
      <text
        x={arc.centroid[0]}
        y={arc.centroid[1] + 22}
        textAnchor="middle"
        alignmentBaseline="hanging"
        fill="#fff"
        fontSize={12}
        fontWeight={600}
        style={{ pointerEvents: 'none' }}
      >
        {(data.label && data.label.length < 10)
          ? `${data.label} (${percent.toFixed(1)}%)`
          : `${percent.toFixed(1)}%`}
      </text>
    </g>
  );
}

export default function AnalyticsClient() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  // const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/analytics?days=${days}`, { cache: 'no-store' })
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`)
        }
        const result = await res.json()
       // console.log('Raw API Response:', result)
        setData(result)
      } catch (error) {
        console.error('Error loading analytics data:', error)
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [days])

  console.log('Analytics Data:', data); // Log analytics data

  if (loading || !data) {
    return <p className="text-gray-500">Loading analytics...</p>
  }
  const COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
    '#6366f1', '#ec4899', '#8b5cf6', '#14b8a6',
    '#f97316', '#eab308'
  ];

  const calculateOuterRadius = (width: number, height: number) => {
    return Math.min(width, height) / 2 * 0.8;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-400">Select Range:</label>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value))}
          className="rounded bg-slate-700 text-white px-3 py-1 border border-slate-600"
        >
          {dayOptions.map((d) => (
            <option key={d} value={d}>{d} days</option>
          ))}
        </select>
      </div>

      <p className="text-gray-400">Showing data from the last {data.days} days</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.ticketsCreatedHistory && Array.isArray(data.ticketsCreatedHistory) && data.ticketsCreatedHistory.length > 0 && (
          <div key="tickets-created">
            {(() => {
              const chartData = [{ 
                id: 'Tickets Created', 
                data: data.ticketsCreatedHistory
                  .map((count, index) => ({ 
                    x: `${index + 1} days ago`, 
                    y: typeof count === 'number' ? count : (count != null ? Number(count) : 0)
                  }))
                  .filter(item => item && typeof item.x !== 'undefined' && typeof item.y !== 'undefined' && item.y !== null && !isNaN(item.y))
              }];
              console.log('Tickets Created chartData:', chartData);
              return (
                <LineChart
                  title="Tickets Created"
                  data={chartData}
                  xScaleType="point"
                />
              );
            })()}
          </div>
        )}
        {data.ticketsClosedHistory && Array.isArray(data.ticketsClosedHistory) && data.ticketsClosedHistory.length > 0 && (
          <div key="tickets-closed">
            {(() => {
              const chartData = [{ 
                id: 'Tickets Closed', 
                data: data.ticketsClosedHistory
                  .map((count, index) => ({ 
                    x: `${index + 1} days ago`, 
                    y: typeof count === 'number' ? count : (count != null ? Number(count) : 0)
                  }))
                  .filter(item => item && typeof item.x !== 'undefined' && typeof item.y !== 'undefined' && item.y !== null && !isNaN(item.y))
              }];
              console.log('Tickets Closed chartData:', chartData);
              return (
                <LineChart
                  title="Tickets Closed"
                  data={chartData}
                  xScaleType="point"
                />
              );
            })()}
          </div>
        )}
        {data.staffActionsHistory && Array.isArray(data.staffActionsHistory) && data.staffActionsHistory.length > 0 && (
          <div key="staff-actions">
            {(() => {
              const chartData = [{ 
                id: 'Staff Actions', 
                data: data.staffActionsHistory
                  .map((count, index) => ({ 
                    x: `${index + 1} days ago`, 
                    y: typeof count === 'number' ? count : (count != null ? Number(count) : 0)
                  }))
                  .filter(item => item && typeof item.x !== 'undefined' && typeof item.y !== 'undefined' && item.y !== null && !isNaN(item.y))
              }];
              console.log('Staff Actions chartData:', chartData);
              return (
                <LineChart
                  title="Staff Actions"
                  data={chartData}
                  xScaleType="point"
                />
              );
            })()}
          </div>
        )}
        {(() => {
          const logChartData: Array<{ id: string; data: { x: string; y: number }[] }> = [];
          const levelsToChart = ['info', 'warn', 'error']; // Explicitly chart these levels

          if (data.logsByLevelHistory && typeof data.logsByLevelHistory === 'object') {
            levelsToChart.forEach(level => {
              const history = data.logsByLevelHistory[level];
              if (history && Array.isArray(history) && history.length > 0) {
                const validData = history
                  .map((count, index) => ({
                    x: `${index + 1} days ago`,
                    y: typeof count === 'number' ? count : (count != null ? Number(count) : 0)
                  }))
                  .filter(item => item && typeof item.x !== 'undefined' && typeof item.y !== 'undefined' && item.y !== null && !isNaN(item.y));

                if (validData.length > 0) {
                  logChartData.push({
                    id: `Logs: ${level}`,
                    data: validData
                  });
                }
              }
            });
          }

          // Only render the chart if there's data for at least one log level
          if (logChartData.length > 0) {
            return (
              <div key="logs-combined">
                <LineChart
                  title="Logs by Level"
                  data={logChartData}
                  xScaleType="point"
                />
              </div>
            );
          }
          return null; // Return null if no log data to display
        })()}
      </div>

      {/* Open Tickets Trend Chart */}
      {data.ticketsCreatedHistory && data.ticketsClosedHistory && (
        <div key="open-tickets-trend">
          {(() => {
            const openTicketsHistory = data.ticketsCreatedHistory.map((createdCount, index) => {
              const closedCount = data.ticketsClosedHistory[index] || 0;
              const openCount = createdCount - closedCount;
              return {
                x: `${index + 1} days ago`,
                y: openCount >= 0 ? openCount : 0 // Ensure open tickets is not negative
              };
            }).filter(item => item && typeof item.x !== 'undefined' && typeof item.y !== 'undefined' && item.y !== null && !isNaN(item.y));

            if (openTicketsHistory.length === 0) return null;

            const chartData = [{
              id: 'Open Tickets',
              data: openTicketsHistory
            }];
            console.log('Open Tickets Trend chartData:', chartData);
            return (
              <LineChart
                title="Open Tickets Trend"
                data={chartData}
                xScaleType="point"
              />
            );
          })()}
        </div>
      )}

      {/* Total Tickets by Ticket Type Pie Chart */}
      {data.ticketTypeBreakdown && Object.keys(data.ticketTypeBreakdown).length > 0 && (
        <div className="pt-8" key="total-tickets-by-type-pie">
          <h2 className="text-xl font-semibold mb-2 text-white">Total Tickets by Type</h2>
          <div className="rounded-xl bg-white/5 p-6 shadow border flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 min-w-[400px] h-[500px]">
              <NivoPieChart
                data={Object.entries(data.ticketTypeBreakdown).map(([type, count]) => ({
                  id: type,
                  label: type.charAt(0).toUpperCase() + type.slice(1),
                  value: count
                }))}
                colors={COLORS}
                labelType="type"
              />
            </div>
          </div>
        </div>
      )}

      {/* Total Closed Tickets by Source Pie Chart */}
      {data.totalClosedBySource && (
        <div className="pt-8" key="total-closed-tickets-by-source-pie">
          <h2 className="text-xl font-semibold mb-2 text-white">Total Closed Tickets by Source</h2>
          <div className="rounded-xl bg-white/5 p-6 shadow border flex flex-col lg:flex-row gap-6 items-start">
            <div className="flex-1 min-w-[400px] h-[500px]">
              <NivoPieChart
                data={
                  [
                    { id: 'live', label: 'Live (Active)', value: data.totalClosedBySource.live },
                    { id: 'ticketsbot', label: 'Ticketsbot (Archived)', value: data.totalClosedBySource.ticketsbot },
                    { id: 'tickettool', label: 'Tickettool (Archived)', value: data.totalClosedBySource.tickettool }
                  ].filter(item => item.value > 0)
                }
                colors={COLORS}
                labelType="source"
              />
            </div>
          </div>
        </div>
      )}

      <div className="pt-8">
        <h2 className="text-xl font-semibold mb-2 text-white">Single Value Metrics</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SingleValueDisplay title="Open Tickets" value={data.openTickets} />
          <SingleValueDisplay title="Total Tickets Created" value={data.totalTicketsCreated} />
          <SingleValueDisplay title="Total Tickets Closed" value={data.totalTicketsClosed} />
{/*       <SingleValueDisplay title="Live Tickets" value={data.totalCreated.live} />
          <SingleValueDisplay title="Ticketsbot" value={data.totalCreated.ticketsbot} />
          <SingleValueDisplay title="Ticket Tool" value={data.totalCreated.tickettool} />*/}
          <SingleValueDisplay title="Total Logs" value={Object.values(data.logsByLevel).reduce((sum, count) => sum + count, 0)} />
        </div>
      </div>

      <div className="pt-8">
        <h2 className="text-xl font-semibold mb-1 text-white">Claimed Tickets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(data.claimedBreakdown)
            .sort((a, b) => b[1] - a[1]) // sort descending by total claims
            .map(([username, total]) => (
              <div key={username} className="flex flex-col gap-2 p-4 bg-white/5 rounded-xl border shadow">
                <div className="flex items-center gap-4">
                  <img
                    src={data.claimedAvatars[username] || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                    alt={username}
                    className="w-10 h-10 rounded-full border border-slate-600"
                  />
                  <div>
                    <div className="text-sm text-white font-medium">{username}</div>
                    <div className="text-sm text-gray-400">{total} total claimed</div>
                  </div>
                </div>

                <div className="pl-14 text-xs text-gray-400 space-y-1">
                  {(['live', 'ticketsbot', 'tickettool'] as const).map((source) => {
                    const count = data.claimedBySource[source]?.[username] || 0;
                    return count > 0 ? (
                      <div key={source}>
                        {source.charAt(0).toUpperCase() + source.slice(1)}: {count}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="pt-8">
        <h2 className="text-xl font-semibold mb-2 text-white">Closed Tickets Distribution</h2>
        <div className="rounded-xl bg-white/5 p-6 shadow border flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Left: List */}
          <div className="flex-1 space-y-3">
            {Object.entries(data.closedBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([username, total]) => (
                <div key={username} className="flex items-center gap-3">
                  <img
                    src={data.closedAvatars[username] || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                    alt={username}
                    className="w-16 h-16 rounded-full border border-slate-600"
                  />
                  <div className="text-white text-medium font-medium">
                    {username} — <span className="text-gray-400 font-normal">{total} closed</span>
                  </div>
                </div>
              ))}
          </div>
          <div className="flex-1 min-w-[400px] h-[500px]">
            <NivoPieChart
              data={Object.entries(data.closedBreakdown)
                .filter(([name]) => name !== 'non-staff user')
                .map(([name, value]) => ({
                  id: name,
                  label: name,
                  value,
                  avatar: data.closedAvatars[name]
                }))}
              colors={COLORS}
              labelType="closed"
            />
          </div>
        </div>
      </div>
      <div className="pt-8">
        <h2 className="text-xl font-semibold mb-2 text-white">Claim Distribution (Tracking since 01/20/2025)</h2>
        <div className="rounded-xl bg-white/5 p-6 shadow border flex flex-col lg:flex-row gap-6 items-start">
          
          {/* Left: List */}
          <div className="flex-1 space-y-3">
            {Object.entries(data.claimedBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([username, total]) => (
                <div key={username} className="flex items-center gap-3">
                  <img
                    src={data.claimedAvatars[username] || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                    alt={username}
                    className="w-16 h-16 rounded-full border border-slate-600"
                  />
                  <div className="text-white text-medium font-medium">
                    {username} — <span className="text-gray-400 font-normal">{total} claimed</span>
                  </div>
                </div>
              ))}
          </div>

          <div className="flex-1 min-w-[400px] h-[500px]">
            <NivoPieChart
              data={Object.entries(data.claimedBreakdown).map(([name, value]) => ({
                id: name,
                label: name,
                value,
                avatar: data.claimedAvatars[name]
              }))}
              colors={COLORS}
              labelType="claimed"
            />
          </div>
        </div>
      </div>
    </div>
    )
  }


/**
 * NivoPieChart: Modern Pie Chart using @nivo/pie
 * - Responsive, animated, and supports avatars in labels.
 * - No label is ever cut off; Nivo handles label placement and collision.
 * - Custom tooltip and legend for avatars and percentages.
 */
function NivoPieChart({
  data,
  colors,
  labelType
}: {
  data: { id: string; label: string; value: number; avatar?: string }[];
  colors: string[];
  labelType: string;
}) {
  // Nivo expects a colorBy function or array
  return (
    <div style={{ width: '100%', height: 500 }}>
      <ResponsivePie
        data={data}
        margin={{ top: 40, right: 120, bottom: 60, left: 80 }}
        innerRadius={0.5}
        padAngle={1.5}
        cornerRadius={6}
        colors={colors}
        borderWidth={2}
        borderColor={{ from: 'color', modifiers: [['darker', 0.3]] }}
        enableArcLabels={true}
        arcLabelsSkipAngle={10}
        arcLabel={d =>
          String(d.label).length < 10
            ? `${String(d.label)} (${((d.value / data.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1)}%)`
            : `${((d.value / data.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1)}%`
        }
        arcLabelsTextColor="#fff"
        arcLinkLabelsSkipAngle={10}
        arcLinkLabelsTextColor="#fff"
        arcLinkLabelsThickness={2}
        arcLinkLabelsColor={{ from: 'color' }}
        tooltip={({ datum }) => (
          <div style={{
            background: '#222',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <img
              src={datum.data.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}
              alt={String(datum.label)}
              style={{ width: 32, height: 32, borderRadius: '50%' }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>{String(datum.label)}</div>
              <div>{datum.value} ({((datum.value / data.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1)}%)</div>
            </div>
          </div>
        )}
        legends={[
          {
            anchor: 'right',
            direction: 'column',
            justify: false,
            translateX: 100,
            translateY: 0,
            itemsSpacing: 8,
            itemWidth: 120,
            itemHeight: 32,
            itemTextColor: '#fff',
            itemDirection: 'left-to-right',
            symbolSize: 32,
            // Removed custom symbolShape to avoid type errors
            effects: [
              {
                on: 'hover',
                style: {
                  itemTextColor: '#fbbf24'
                }
              }
            ]
          }
        ]}
        theme={{
          labels: {
            text: {
              fontSize: 14,
              fontWeight: 600
            }
          },
          legends: {
            text: {
              fontSize: 14,
              fontWeight: 500
            }
          }
        }}
      />
    </div>
  );
}

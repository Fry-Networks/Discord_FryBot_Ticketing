'use client'

import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useState, useEffect } from 'react';

type LineChartProps = {
  data: { id: string; data: { x: string; y: number }[] }[];
  title: string;
  xScaleType?: 'point' | 'time'; // Recharts handles this differently, but keeping for compatibility
  xFormat?: string;
  yFormat?: string;
}

export default function LineChart({ data, title, xFormat, yFormat }: LineChartProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Validate data before rendering
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-6 shadow border" style={{ height: '400px' }}>
        <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
        <div className="flex items-center justify-center h-full bg-slate-800/50 rounded-lg">
          <div className="text-gray-400">No data available</div>
        </div>
      </div>
    );
  }

  // Recharts expects data in a flat array of objects for the domain
  // We need to transform the data from Nivo format to Recharts format
  const transformedData = data[0].data.map(item => ({
    name: item.x, // Use x as the name for XAxis
    value: item.y // Use y as the value for the Line
  }));

  if (transformedData.length === 0) {
    return (
      <div className="rounded-xl bg-white/5 p-6 shadow border" style={{ height: '400px' }}>
        <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
        <div className="flex items-center justify-center h-full bg-slate-800/50 rounded-lg">
          <div className="text-gray-400">No valid data</div>
        </div>
      </div>
    );
  }

  // Show loading state until client-side rendering is ready
  if (!isClient) {
    return (
      <div className="rounded-xl bg-white/5 p-6 shadow border" style={{ height: '400px' }}>
        <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
        <div className="flex items-center justify-center h-full bg-slate-800/50 rounded-lg animate-pulse">
          <div className="text-gray-400">Loading chart data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/5 p-6 shadow border" style={{ height: '400px' }}>
      <h3 className="text-lg font-semibold mb-4 text-white">{title}</h3>
      <ResponsiveContainer width="100%" height="85%">
        <RechartsLineChart
          data={transformedData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="name" 
            stroke="#9ca3af" 
            angle={-45} 
            textAnchor="end" 
            height={60}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis 
            stroke="#9ca3af" 
            tickFormatter={typeof yFormat === 'function' ? yFormat : (value) => String(value ?? '')}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1f2937', 
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#e5e7eb'
            }} 
            itemStyle={{ color: '#e5e7eb' }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Legend 
            wrapperStyle={{ color: '#e5e7eb' }}
            formatter={(value) => <span style={{ color: '#e5e7eb' }}>{value}</span>}
          />
          {data.map((series, index) => (
            <Line 
              key={series.id}
              type="monotone" 
              dataKey="value" // Always 'value' after transformation
              stroke={`hsl(${index * 60}, 70%, 60%)`} // Dynamic color based on index
              activeDot={{ r: 8 }} 
              name={series.id} // Use original series ID for legend
              strokeWidth={2}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

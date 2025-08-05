import React from 'react';

type SingleValueDisplayProps = {
  title: string;
  value: number;
};

const SingleValueDisplay: React.FC<SingleValueDisplayProps> = ({ title, value }) => {
  return (
    <div className="rounded-xl border bg-white/5 p-6 shadow flex flex-col items-center justify-center text-center">
      <h3 className="text-sm text-gray-400 mb-2">{title}</h3>
      <p className="text-4xl font-bold text-white">{value}</p>
    </div>
  );
};

export default SingleValueDisplay;

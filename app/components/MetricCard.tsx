type Props = {
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
};

export function MetricCard({ label, value, sub, loading }: Props) {
  if (loading) {
    return (
      <div className="flex-1 min-w-0 rounded-xl bg-[#112347] border border-[#1A3456]/50 p-4 animate-pulse">
        <div className="h-2.5 w-20 bg-[#1A3456] rounded mb-3" />
        <div className="h-7 w-14 bg-[#1A3456] rounded mb-2" />
        <div className="h-2 w-10 bg-[#1A3456] rounded" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-0 rounded-xl bg-[#112347] border border-[#1A3456]/50 p-4 transition-colors hover:border-blue-600/30">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-widest mb-1.5">
        {label}
      </p>
      <p className="text-2xl font-semibold text-white leading-none mb-1">{value}</p>
      {sub && <p className="text-[10px] text-gray-600">{sub}</p>}
    </div>
  );
}

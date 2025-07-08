import React from "react";

interface Plant {
  code: string;
  name: string;
}

interface AllocationTableProps {
  allocations: Array<{ plant: string; demand: number }>;
  plants: Plant[];
  isSolo?: boolean; // true if allocation is the only chart open
}

export function AllocationTable({ allocations, plants, isSolo }: AllocationTableProps) {
  // Plant code -> name lookup
  const codeToName = React.useMemo(() => {
    const map: Record<string, string> = {};
    plants.forEach((p) => { map[p.code] = p.name; });
    return map;
  }, [plants]);

  if (!allocations || allocations.length === 0) {
    return (
      <div className={`p-6 rounded-2xl shadow-sm border border-blue-100 bg-blue-50 text-blue-700 text-center text-sm mx-auto ${isSolo ? "w-fit mt-12" : ""}`}>
        ไม่พบข้อมูล Allocation สำหรับ SKU นี้
      </div>
    );
  }
  return (
    <div className={`transition-all ${isSolo ? "flex flex-col items-center justify-center w-full mt-12" : ""}`}>
      <div className="mb-2 flex items-center gap-2">
        <div className="text-base font-semibold text-blue-800 flex items-center gap-1">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="3" fill="#3b82f6"/><rect x="7" y="8" width="10" height="8" rx="2" fill="#bfdbfe"/></svg>
          Allocation
        </div>
        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-xl font-medium">{allocations.length} branches</span>
      </div>
    <div
    className="overflow-x-auto max-w-[380px] w-full"
    style={{ height: '180px', overflowY: 'auto' }}
    >
        <table className="w-full border-separate border-spacing-y-1">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left text-xs bg-blue-100 text-blue-700 rounded-l-xl">Branch</th>
              <th className="px-2 py-2 text-left text-xs bg-blue-100 text-blue-700">Name</th>
              <th className="px-2 py-2 text-right text-xs bg-blue-100 text-blue-700 rounded-r-xl">Amount</th>
            </tr>
          </thead>
          <tbody>
            {[...allocations].sort((a, b) => b.demand - a.demand).map((row, i) => (
              <tr key={row.plant + i} className="bg-white shadow-sm rounded-xl hover:bg-blue-50 transition-all">
                <td className="px-2 py-2 rounded-l-xl font-mono text-blue-800">{row.plant}</td>
                <td className="px-2 py-2 text-blue-900">{codeToName[row.plant] || '-'}</td>
                <td className="px-2 py-2 rounded-r-xl text-right font-bold text-blue-700">{row.demand}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

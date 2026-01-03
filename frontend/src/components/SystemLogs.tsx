'use client';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
}

interface Props {
  employees: Employee[];
}

export default function SystemLogs({ employees }: Props) {
  // Pega os últimos 5 funcionários (assumindo que IDs maiores são mais recentes)
  // Fazemos uma cópia do array ([...]) para não estragar a lista original com o sort
  const recentActivity = [...employees]
    .sort((a, b) => b.id - a.id)
    .slice(0, 5);

  return (
    <div className="border border-gray-800 bg-black p-0 overflow-hidden relative h-[300px] flex flex-col">
      {/* Cabeçalho do Terminal */}
      <div className="bg-gray-900 border-b border-gray-800 p-2 flex justify-between items-center">
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest pl-2">
          /// SYSTEM_LOGS // REALTIME_MONITORING
        </span>
        <div className="flex gap-1 pr-2">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></div>
        </div>
      </div>

      {/* Área de Logs com Scroll estilo Terminal */}
      <div className="p-4 font-mono text-xs overflow-y-auto custom-scrollbar flex-1 bg-black/90">
        <div className="space-y-3">
          {recentActivity.map((emp, index) => (
            <div key={emp.id} className="border-l-2 border-gray-800 pl-3 py-1 hover:border-red-600 hover:bg-white/5 transition-colors group">
              <div className="flex justify-between text-gray-500 mb-1">
                <span className="text-[9px]">ID_REF: #{String(emp.id).padStart(4, '0')}</span>
                <span className="text-[9px] group-hover:text-red-500">STATUS: ACTIVE</span>
              </div>
              <div className="text-gray-300">
                New asset registered: <span className="text-white font-bold">{emp.full_name}</span>
              </div>
              <div className="text-[10px] text-gray-600 mt-1">
                Allocated to <span className="text-red-900">{emp.department}</span> as [{emp.role}]
              </div>
            </div>
          ))}

          {employees.length === 0 && (
            <div className="text-gray-700 italic">
              &gt; Waiting for data stream...
            </div>
          )}
          
          <div className="text-red-900/40 text-[10px] mt-4 pt-4 border-t border-gray-900/50">
            &gt; END OF STREAM
          </div>
        </div>
      </div>
    </div>
  );
}
'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface Employee {
  id: number;
  role: string;
  department: string;
}

interface Props {
  employees: Employee[];
}

export default function DepartmentChart({ employees }: Props) {
  // 1. Processamento de Dados: Agrupar por Departamento
  const dataMap = employees.reduce((acc, curr) => {
    const dept = curr.department || 'UNKNOWN'; // Trata nulos
    acc[dept] = (acc[dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Transforma em array para o gráfico: [{ name: 'TI', value: 5 }, ...]
  const data = Object.keys(dataMap).map(key => ({
    name: key.toUpperCase(),
    value: dataMap[key]
  }));

  // Cores personalizadas para as barras (Alternando tons de vermelho Arasaka)
  const getBarColor = (index: number) => {
    return index % 2 === 0 ? '#dc2626' : '#991b1b'; // Red-600 vs Red-800
  };

  if (employees.length === 0) return null;

  return (
    <div className="bg-black border border-gray-800 p-6 shadow-lg mb-8 relative">
      <h3 className="text-gray-500 text-xs uppercase tracking-[0.2em] font-bold mb-6 flex items-center gap-2">
        📊 Department Distribution
      </h3>

      <div className="h-[300px] w-full text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            {/* Linhas de fundo sutis */}
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
            
            {/* Eixo X (Números) */}
            <XAxis type="number" stroke="#9ca3af" tick={{ fill: '#6b7280' }} />
            
            {/* Eixo Y (Nomes dos Departamentos) */}
            <YAxis 
              dataKey="name" 
              type="category" 
              width={100} 
              stroke="#9ca3af" 
              tick={{ fill: '#e5e7eb', fontWeight: 'bold' }} 
            />
            
            {/* Tooltip Customizado (Janela que aparece ao passar o mouse) */}
            <Tooltip 
              contentStyle={{ backgroundColor: '#111827', borderColor: '#ef4444' }}
              itemStyle={{ color: '#fff' }}
              cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
            />
            
            {/* Barras */}
            <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(index)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Detalhe Decorativo no canto */}
      <div className="absolute top-0 right-0 p-2">
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-red-600"></div>
          <div className="w-1 h-1 bg-gray-600"></div>
          <div className="w-1 h-1 bg-gray-600"></div>
        </div>
      </div>
    </div>
  );
}
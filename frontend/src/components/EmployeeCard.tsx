'use client';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
  photo?: string; // URL da foto vindo do backend
}

interface Props {
  employee: Employee;
  onUpdate: () => void;
  onEdit: (employee: Employee) => void;
}

export default function EmployeeCard({ employee, onUpdate, onEdit }: Props) {
  
  const handleDelete = async () => {
    if (!confirm(`Confirmar desligamento de ${employee.full_name}?`)) return;
    const token = localStorage.getItem('access_token');
    try {
      await fetch(`http://localhost:8000/api/employees/${employee.id}/`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      onUpdate();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="border border-gray-700 bg-gray-800 text-white relative group hover:border-red-600 transition-all flex flex-col md:flex-row overflow-hidden">
      
      {/* --- ÁREA DA FOTO --- */}
      <div className="w-full md:w-1/3 bg-black relative min-h-[150px]">
        {employee.photo ? (
          // Se tiver foto, mostra ela
          <img 
            src={employee.photo} 
            alt={employee.full_name} 
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 opacity-80 group-hover:opacity-100"
          />
        ) : (
          // Placeholder (Silhueta) se não tiver foto
          <div className="w-full h-full flex items-center justify-center bg-gray-900 text-gray-700">
             <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          </div>
        )}
        
        {/* Efeito de Scanline sobre a foto */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
      </div>

      {/* --- ÁREA DE DADOS --- */}
      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-lg leading-tight">{employee.full_name}</h3>
            <div className="flex gap-2 bg-black/50 p-1 rounded backdrop-blur-sm">
              <button onClick={() => onEdit(employee)} className="text-gray-400 hover:text-yellow-400">✏️</button>
              <button onClick={handleDelete} className="text-gray-400 hover:text-red-500">🗑️</button>
            </div>
          </div>

          <p className="text-red-500 font-mono text-xs tracking-widest mt-1">[{employee.role}]</p>
          <p className="text-gray-400 text-xs mt-3">{employee.email}</p>
        </div>
        
        <div className="mt-4 pt-4 border-t border-gray-700 flex justify-between items-center">
          <p className="text-gray-500 text-[10px] uppercase">{employee.department}</p>
          <span className="text-[10px] text-gray-600 font-mono">ID: #{String(employee.id).padStart(4, '0')}</span>
        </div>
      </div>
    </div>
  );
}
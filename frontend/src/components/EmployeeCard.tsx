'use client';

interface Employee {
  id: number;
  full_name: string;
  role: string;
  department: string;
  email: string;
}

interface Props {
  employee: Employee;
  onUpdate: () => void;
  onEdit: (employee: Employee) => void; // Novo: função que recebe o funcionário para editar
}

export default function EmployeeCard({ employee, onUpdate, onEdit }: Props) {
  
  const handleDelete = async () => {
    if (!confirm(`Confirmar desligamento de ${employee.full_name}?`)) return;
    try {
      await fetch(`http://localhost:8000/api/employees/${employee.id}/`, { method: 'DELETE' });
      onUpdate();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="border border-gray-700 p-4 bg-gray-800 text-white relative group hover:border-red-600 transition-colors">
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg">{employee.full_name}</h3>
        
        <div className="flex gap-2">
          {/* BOTÃO EDITAR (Lápis) */}
          <button 
            onClick={() => onEdit(employee)} 
            className="text-gray-500 hover:text-yellow-400 transition-colors"
            title="Editar"
          >
            ✏️
          </button>
          
          {/* BOTÃO EXCLUIR (Lixeira) */}
          <button 
            onClick={handleDelete} 
            className="text-gray-500 hover:text-red-500 transition-colors"
            title="Excluir"
          >
            🗑️
          </button>
        </div>
      </div>

      <p className="text-red-400 font-mono text-sm">[{employee.role}]</p>
      <p className="text-gray-400 text-sm mt-2">{employee.email}</p>
      <p className="text-gray-500 text-xs">{employee.department}</p>
    </div>
  );
}
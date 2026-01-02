'use client';

interface Props {
  onSearch: (query: string) => void;
}

export default function SearchBar({ onSearch }: Props) {
  return (
    <div className="mb-8 relative group">
      {/* Efeito de brilho vermelho quando focado */}
      <div className="absolute -inset-0.5 bg-red-600 opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
      
      <div className="relative flex items-center bg-black border border-gray-800">
        {/* Ícone de Terminal */}
        <div className="pl-4 text-red-500 font-mono text-lg font-bold select-none">
          &gt;_
        </div>
        
        <input
          type="text"
          onChange={(e) => onSearch(e.target.value)}
          placeholder="SEARCH DATABASE..."
          className="w-full bg-black text-gray-100 p-4 font-mono outline-none placeholder-gray-700 uppercase tracking-wider"
        />
        
        {/* Ícone de Lupa decorativo */}
        <div className="pr-4 text-gray-700">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
    </div>
  );
}
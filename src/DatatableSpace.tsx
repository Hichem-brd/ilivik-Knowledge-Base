import React, { useState } from "react";
import { Download, Search, FileSpreadsheet } from "lucide-react";
import { ErrorRecord } from "./types";

interface DatatableSpaceProps {
  errors: ErrorRecord[];
  isSuperAdmin: boolean;
}

export default function DatatableSpace({ errors, isSuperAdmin }: DatatableSpaceProps) {
  const [search, setSearch] = useState("");

  const filteredErrors = errors.filter(err => {
    const s = search.toLowerCase();
    const statusText = err.isResolved ? "resolu" : "en attente";
    return (
      (err.title || "").toLowerCase().includes(s) ||
      (err.errorCode || "").toLowerCase().includes(s) ||
      (err.description || "").toLowerCase().includes(s) ||
      (err.errorCategory || "").toLowerCase().includes(s) ||
      (err.errorType || "").toLowerCase().includes(s) ||
      (err.client || "").toLowerCase().includes(s) ||
      statusText.includes(s)
    );
  });

  const exportToCSV = () => {
    // Basic CSV exporter
    const headers = ["ID", "Titre", "Code Erreur", "Catégorie", "Type", "Priorité", "Client", "Date", "Auteur", "Statut", "Solution", "Auteur Solution"];
    
    const rows = filteredErrors.map(err => {
      const solution = err.solution ? err.solution.replace(/"/g, '""').replace(/\n/g, ' ') : "Non résolu";
      const title = err.title ? err.title.replace(/"/g, '""') : "";
      const statusText = err.isResolved ? "RÉSOLU" : "EN ATTENTE";
      
      return [
        `"${err.id}"`,
        `"${title}"`,
        `"${err.errorCode || ''}"`,
        `"${err.errorCategory || ''}"`,
        `"${err.errorType || ''}"`,
        `"${err.errorPriority || ''}"`,
        `"${err.client || ''}"`,
        `"${new Date(err.createdAt).toLocaleString('fr-FR')}"`,
        `"${err.author}"`,
        `"${statusText}"`,
        `"${solution}"`,
        `"${err.author || ''}"`
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `export_fiches_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl min-h-[400px] flex flex-col fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-indigo-400" />
            Export et Tableau de Données
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Recherchez et exportez les fiches d'erreurs en format CSV (compatible Excel).
          </p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="relative flex-grow">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Rechercher une fiche..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-white pl-9 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none transition-all"
            />
          </div>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 whitespace-nowrap"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-auto rounded-xl border border-slate-800 bg-slate-950">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
              <th className="p-3 font-semibold">Titre</th>
              <th className="p-3 font-semibold">Catégorie & Type</th>
              <th className="p-3 font-semibold">Statut</th>
              <th className="p-3 font-semibold">Auteur</th>
              <th className="p-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody className="text-xs text-slate-300 divide-y divide-slate-850">
            {filteredErrors.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">Aucune donnée trouvée.</td>
              </tr>
            ) : (
              filteredErrors.map(err => (
                <tr key={err.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="p-3 font-semibold text-slate-200">
                    <div className="line-clamp-1" title={err.title}>{err.title || "(Sans titre)"}</div>
                  </td>
                  <td className="p-3 text-indigo-300">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-500/10 whitespace-nowrap">
                      {err.errorCategory || "Standard"} {err.errorType ? `(${err.errorType})` : ""}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                      err.isResolved ? "bg-emerald-950 text-emerald-400 border border-emerald-500/20" : "bg-amber-950 text-amber-500 border border-amber-500/20"
                    }`}>
                      {err.isResolved ? "RÉSOLU" : "EN ATTENTE"}
                    </span>
                  </td>
                  <td className="p-3 opacity-90">{err.author}</td>
                  <td className="p-3 opacity-70 whitespace-nowrap">{new Date(err.createdAt).toLocaleDateString('fr-FR')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useState, useRef } from "react";
import { Download, Search, FileSpreadsheet, Upload, Edit, FileType2 } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ErrorRecord } from "./types";

interface DatatableSpaceProps {
  errors: ErrorRecord[];
  isSuperAdmin: boolean;
  onEdit: (err: ErrorRecord) => void;
  allowImportBulk?: boolean;
  allowExportPdf?: boolean;
  allowExportExcel?: boolean;
  allowImportTemplate?: boolean;
  allowActions?: boolean;
}

export default function DatatableSpace({ errors, isSuperAdmin, onEdit, allowImportBulk, allowExportPdf, allowExportExcel, allowImportTemplate, allowActions }: DatatableSpaceProps) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  const handleToggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredErrors.map(err => err.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonRows || jsonRows.length === 0) {
        alert("Fichier vide ou invalide.");
        setIsImporting(false);
        return;
      }

      // Prepare payload mapping
      const payloadRows = jsonRows.map((row: any) => {
        return {
          id: row["ID"] || row["id"], // Support uppercase or lowercase header
          application: row["Application"] || row["application"],
          title: row["Titre"] || row["title"],
          errorCode: row["Code Erreur"] || row["errorCode"],
          errorCategory: row["Catégorie"] || row["errorCategory"],
          errorType: row["Type"] || row["errorType"],
          errorPriority: row["Priorité"] || row["errorPriority"],
          client: row["Client"] || row["client"],
          description: row["Description"] || row["description"],
          solution: row["Solution"] || row["solution"],
          author: row["Auteur"] || row["author"],
          imageUrl: row["Image"] || row["imageUrl"],
          tags: row["Tags"] ? row["Tags"].split(",").map((t: string) => t.trim()) : undefined
        };
      });

      const response = await fetch("/api/errors/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payloadRows })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      alert(`Import réussi !\n${result.message}`);
      window.location.reload(); // Quick refresh to load the new data
    } catch (err: any) {
      console.error(err);
      alert("Erreur lors de l'import: " + err.message);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      {
        "ID": "",
        "Application": "Salesbuzz",
        "Titre": "Exemple d'erreur",
        "Code Erreur": "ERR-01",
        "Catégorie": "Matériel",
        "Type": "Hardware",
        "Priorité": "High",
        "Client": "John Doe",
        "Description": "Le système ne démarre pas.",
        "Solution": "Remettre le câble d'alimentation.",
        "Auteur": "John Smith",
        "Image": "",
        "Tags": "alim, hardware"
      }
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modèle Import");
    XLSX.writeFile(wb, "template_import.xlsx");
  };

  const exportToExcel = () => {
    if (selectedIds.size === 0) {
      alert("Veuillez sélectionner au moins une erreur à exporter.");
      return;
    }

    const recordsToExport = filteredErrors.filter(err => selectedIds.has(err.id));

    // Basic Excel exporter
    const headers = ["ID", "Application", "Titre", "Code Erreur", "Catégorie", "Type", "Priorité", "Client", "Date", "Auteur", "Créé par", "Statut", "Solution", "Auteur Solution"];
    
    const rows = recordsToExport.map(err => {
      const solution = err.solution || "Non résolu";
      const title = err.title || "";
      const statusText = err.isResolved ? "RÉSOLU" : "EN ATTENTE";
      const creator = err.cretedby || err.createdBy || err.author || "";
      
      return [
        err.id,
        err.application || '',
        title,
        err.errorCode || '',
        err.errorCategory || '',
        err.errorType || '',
        err.errorPriority || '',
        err.client || '',
        new Date(err.createdAt).toLocaleString('fr-FR'),
        err.author,
        creator,
        statusText,
        solution,
        err.author || ''
      ];
    });

    const worksheetData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Base de Connaissances");
    
    XLSX.writeFile(wb, `export_fiches_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportToPdf = () => {
    if (selectedIds.size === 0) {
      alert("Veuillez sélectionner au moins une erreur à exporter.");
      return;
    }

    const recordsToExport = filteredErrors.filter(err => selectedIds.has(err.id));
    
    const doc = new jsPDF("l", "pt", "a4"); // Landscape for more columns
    doc.text("Export Base de Connaissances", 40, 40);

    const headers = [["Titre", "App.", "Catégorie", "Statut", "Erreur", "Image Err.", "Solution", "Image Sol."]];
    const data = recordsToExport.map(err => [
      err.title || "",
      err.application || "N/A",
      err.errorCategory || "",
      err.isResolved ? "Résolu" : "En attente",
      err.description || "",
      "", // placeholder for err img
      err.solution || "",
      ""  // placeholder for sol img
    ]);

    autoTable(doc, {
      startY: 60,
      head: headers,
      body: data,
      styles: { fontSize: 7, valign: 'middle', cellWidth: 'wrap' },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 60 },
        2: { cellWidth: 60 },
        3: { cellWidth: 50 },
        4: { cellWidth: 120 },
        5: { cellWidth: 110 },
        6: { cellWidth: 120 },
        7: { cellWidth: 110 },
      },
      bodyStyles: { minCellHeight: 110 },
      didDrawCell: (data) => {
        if (data.section === 'body') {
          const err = recordsToExport[data.row.index];
          // Error Image (Column 5)
          if (data.column.index === 5 && err.imageUrl && err.imageUrl.startsWith("data:image")) {
            try {
              doc.addImage(err.imageUrl, data.cell.x + 5, data.cell.y + 5, 100, 100);
            } catch (e) {
              console.error("Could not add error image to PDF", e);
            }
          }
          // Solution Image (Column 7)
          if (data.column.index === 7 && err.solutionImageUrl && err.solutionImageUrl.startsWith("data:image")) {
            try {
              doc.addImage(err.solutionImageUrl, data.cell.x + 5, data.cell.y + 5, 100, 100);
            } catch (e) {
              console.error("Could not add solution image to PDF", e);
            }
          }
        }
      },
    });

    doc.save(`export_fiches_${new Date().toISOString().slice(0,10)}.pdf`);
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
              className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 text-slate-100 pl-9 pr-4 py-2 rounded-xl text-xs font-semibold focus:outline-none transition-all"
            />
          </div>
          
          {(allowImportTemplate || isSuperAdmin) && (
            <button
              onClick={downloadTemplate}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-xs rounded-xl flex items-center gap-2 transition-all border border-slate-700 whitespace-nowrap"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Modèle Import</span>
            </button>
          )}

          {(allowImportBulk || isSuperAdmin) && (
            <>
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 whitespace-nowrap"
              >
                <Upload className="h-4 w-4" />
                <span className="hidden sm:inline">{isImporting ? "Import..." : "Import Bulk"}</span>
              </button>
            </>
          )}

          {(allowExportPdf || isSuperAdmin) && (
            <button
              onClick={exportToPdf}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-red-600/20 whitespace-nowrap"
            >
              <FileType2 className="h-4 w-4" />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
          )}
          
          {(allowExportExcel || isSuperAdmin) && (
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-grow overflow-auto rounded-xl border border-slate-800 bg-slate-950">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800 text-xs text-slate-400 uppercase tracking-wider">
              <th className="p-3 w-10 text-center">
                <input 
                  type="checkbox" 
                  checked={filteredErrors.length > 0 && selectedIds.size === filteredErrors.length}
                  onChange={handleToggleAll}
                  className="rounded border-slate-700 bg-slate-800 accent-indigo-500 cursor-pointer w-4 h-4"
                />
              </th>
              <th className="p-3 font-semibold">Titre</th>
              <th className="p-3 font-semibold">Application</th>
              <th className="p-3 font-semibold">Catégorie & Type</th>
              <th className="p-3 font-semibold">Statut</th>
              <th className="p-3 font-semibold">Auteur</th>
              {(allowActions || isSuperAdmin) && (
                <th className="p-3 font-semibold text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="text-xs text-slate-300 divide-y divide-slate-850">
            {filteredErrors.length === 0 ? (
              <tr>
                <td colSpan={allowActions || isSuperAdmin ? 7 : 6} className="p-8 text-center text-slate-500">Aucune donnée trouvée.</td>
              </tr>
            ) : (
              filteredErrors.map(err => (
                <tr key={err.id} className={`hover:bg-slate-900/50 transition-colors ${selectedIds.has(err.id) ? "bg-indigo-950/20" : ""}`}>
                  <td className="p-3 text-center">
                     <input 
                      type="checkbox" 
                      checked={selectedIds.has(err.id)}
                      onChange={() => handleToggleOne(err.id)}
                      className="rounded border-slate-700 bg-slate-800 accent-indigo-500 cursor-pointer w-4 h-4"
                    />
                  </td>
                  <td className="p-3 font-semibold text-slate-200">
                    <div className="line-clamp-1" title={err.title}>{err.title || "(Sans titre)"}</div>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                      {err.application || "Non défini"}
                    </span>
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
                  {(allowActions || isSuperAdmin) && (
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => onEdit(err)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-indigo-500 rounded-lg text-slate-300 hover:text-indigo-400 transition-all cursor-pointer inline-flex items-center"
                        title="Modifier l'erreur"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

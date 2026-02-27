import React, { useState } from 'react';
import { importWikipedia, uploadDocument, deleteGraph } from '../api';
import { Search, FileText, Upload, PlusCircle, Trash2, ExternalLink } from 'lucide-react';



const SidePanel = ({ selectedNode, connectedNodes, onNodeSelect, onGraphUpdate, onGraphClear, onNodeDelete, isFocusMode, onToggleFocus, activeTypes, onToggleType }) => {


    const [wikiQuery, setWikiQuery] = useState('');
    const [importLimit, setImportLimit] = useState(100); // Default limit
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [error, setError] = useState(null);


    // ... (rest of file) ...

    // Near the bottom:





    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            await uploadDocument(file);
            onGraphUpdate();
        } catch (err) {
            setError('Failed to upload document');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const fetchWikiData = async (title) => {
        if (!title.trim()) return;

        setLoading(true);
        setLoadingMessage(`Initializing import for '${title}' (Limit: ${importLimit})...`);
        setError(null);

        try {
            const response = await fetch('http://localhost:8000/import/wikipedia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, limit: parseInt(importLimit, 10) })
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim() !== '');

                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.status === 'progress') {
                            setLoadingMessage(data.message);
                        } else if (data.status === 'error') {
                            throw new Error(data.message);
                        } else if (data.status === 'complete') {
                            // Success
                        }
                    } catch (e) {
                        // Ignore JSON parse errors for incomplete chunks, but rethrow critical errors
                        if (e.message && (e.message.startsWith("Server Error") || e.message === "Page not found")) {
                            throw e;
                        }
                    }
                }
            }

            onGraphUpdate();
            setWikiQuery("");
        } catch (err) {
            console.error("Failed to import wiki:", err);
            setError(err.message || "Failed to import from Wikipedia");
        } finally {
            setLoading(false);
            setLoadingMessage("");
        }
    };

    return (
        <div className="flex flex-col gap-6 text-sm">
            <h2 className="text-xl font-bold border-b border-gray-700 pb-2">Web of Truth</h2>

            {/* Node Details */}
            <section>
                <h3 className="text-gray-400 font-semibold mb-2 uppercase text-xs tracking-wider">Selected Node</h3>
                {selectedNode ? (
                    <div className="bg-gray-700 p-3 rounded-md">
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <h4 className="font-bold text-lg text-blue-300">{selectedNode.label}</h4>
                                <div className="text-gray-300 text-xs">{selectedNode.type}</div>
                            </div>
                            <button
                                onClick={() => fetchWikiData(selectedNode.label)}
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-500 text-white p-1.5 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Expand: Add connections for this node"
                            >
                                <PlusCircle size={16} />
                            </button>
                        </div>

                        {selectedNode.properties && (
                            <div className="mt-2 space-y-1">
                                {Object.entries(selectedNode.properties).map(([key, value]) => {
                                    const strValue = String(value);
                                    const isUrl = strValue.startsWith('http://') || strValue.startsWith('https://');
                                    return (
                                        <div key={key} className="break-all">
                                            <span className="text-gray-500">{key}:</span>{' '}
                                            {isUrl ? (
                                                <a
                                                    href={strValue}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-400 hover:text-blue-300 hover:underline"
                                                >
                                                    {strValue}
                                                </a>
                                            ) : (
                                                <span className="text-gray-200">{strValue.substring(0, 500)}</span>
                                            )}
                                        </div>
                                    );
                                })}

                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-gray-500 italic">Select a node to view details</div>
                )}

                {/* Focus Mode Toggle */}
                {selectedNode && (
                    <div className="mt-2 flex items-center gap-2">
                        <input
                            type="checkbox"
                            checked={isFocusMode}
                            onChange={onToggleFocus}
                            id="focusModeToggle"
                            className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
                        />
                        <label htmlFor="focusModeToggle" className="text-gray-300 text-xs cursor-pointer select-none">
                            Focus Mode (Hide unrelated nodes)
                        </label>
                    </div>
                )}

                {/* Type Filters */}
                <div className="mt-4 pt-4 border-t border-gray-700">
                    <h4 className="text-gray-400 font-semibold mb-2 uppercase text-xs tracking-wider">Filter by Type</h4>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                        {['Person', 'Organization', 'Location', 'Event', 'Technology', 'Work', 'Document', 'WikipediaPage'].map(type => (
                            <div key={type} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`filter-${type}`}
                                    checked={activeTypes && activeTypes.has(type)}
                                    onChange={() => onToggleType(type)}
                                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800 h-3 w-3"
                                />
                                <label htmlFor={`filter-${type}`} className="text-gray-300 text-xs cursor-pointer select-none truncate">
                                    {type}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>


                {/* Connected Nodes */}
                {selectedNode && connectedNodes && connectedNodes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="text-gray-400 font-semibold mb-2 uppercase text-xs tracking-wider">Connections ({connectedNodes.length})</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {connectedNodes.map((node, idx) => (
                                <div
                                    key={`${node.id}-${idx}`}
                                    onClick={() => onNodeSelect(node)}
                                    className="flex items-center gap-2 p-2 bg-gray-900/50 hover:bg-gray-700/80 rounded cursor-pointer transition-colors group"
                                >
                                    <span className="text-xs text-gray-500 w-4 text-center">
                                        {node.direction === 'out' ? '→' : '←'}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-blue-300 text-sm truncate group-hover:text-blue-200">
                                            {node.label}
                                        </div>
                                        <div className="text-gray-500 text-[10px] truncate">
                                            {node.type}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}


                {selectedNode && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                        <button
                            onClick={() => {
                                if (onNodeDelete) {
                                    onNodeDelete(selectedNode.id);
                                }
                            }}
                            className="flex items-center justify-center gap-2 w-full bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-200 rounded px-2 py-1.5 transition-colors text-xs uppercase font-bold tracking-wider"
                        >
                            <Trash2 size={14} />
                            <span>Delete Node</span>
                        </button>
                    </div>
                )}
            </section>


            {/* Sourcing */}
            <section>
                <h3 className="text-gray-400 font-semibold mb-2 uppercase text-xs tracking-wider">Add Data Source</h3>

                {/* Wikipedia */}
                <form onSubmit={(e) => {
                    e.preventDefault();
                    fetchWikiData(wikiQuery);
                }} className="mb-4">
                    <label className="block text-xs mb-1 text-blue-300 font-bold">Add to Graph (Wikipedia)</label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="text"
                            value={wikiQuery}
                            onChange={(e) => setWikiQuery(e.target.value)}
                            placeholder="e.g. Elon Musk"
                            className="bg-gray-700 border border-gray-600 rounded px-2 py-1 w-full focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="number"
                            min="1"
                            max="500"
                            value={importLimit}
                            onChange={(e) => setImportLimit(e.target.value)}
                            className="bg-gray-700 border border-gray-600 rounded px-1 py-1 w-16 text-center focus:outline-none focus:border-blue-500 text-xs"
                            title="Max links to import"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-white disabled:opacity-50"
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </form>

                {/* File Upload */}
                <div>
                    <label className="block text-xs mb-1">Upload Document (PDF/Text)</label>
                    <div className="relative">
                        <input
                            type="file"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="file-upload"
                        />
                        <label
                            htmlFor="file-upload"
                            className="flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 border-dashed rounded px-4 py-2 cursor-pointer transition-colors"
                        >
                            <Upload size={16} />
                            <span>Choose File</span>
                        </label>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-700">
                    <button
                        onClick={() => {
                            if (onGraphClear) onGraphClear();
                        }}
                        className="flex items-center justify-center gap-2 w-full bg-red-900/50 hover:bg-red-900 border border-red-800 text-red-200 rounded px-4 py-2 transition-colors text-xs uppercase font-bold tracking-wider"
                    >
                        <Trash2 size={16} />
                        <span>Clear Database</span>
                    </button>

                </div>


                {error && <div className="text-red-400 mt-2">{error}</div>}
                {loading && (
                    <div className="mt-2">
                        <div className="text-blue-300 animate-pulse">Processing...</div>
                        <div className="text-gray-400 text-xs mt-1">{loadingMessage}</div>
                    </div>
                )}
            </section>



            <div className="text-gray-600 text-xs mt-auto">
                Backend: http://localhost:8000
            </div>
        </div >
    );
};

export default SidePanel;

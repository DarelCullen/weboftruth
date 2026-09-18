import React, { useState } from 'react';
import { importWikipedia, uploadDocument, deleteGraph } from '../api';
import { Search, FileText, Upload, PlusCircle, Trash2, ExternalLink, MapPin, User, Building2, Calendar, FileCode, CheckCircle } from 'lucide-react';

const SidePanel = ({ selectedNode, connectedNodes, highlightedLinkId, onConnectionClick, onNodeSelect, onGraphUpdate, onGraphClear, onNodeDelete, isFocusMode, onToggleFocus, activeTypes, onToggleType }) => {
    const [wikiQuery, setWikiQuery] = useState('');
    const [importLimit, setImportLimit] = useState(100);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");
    const [error, setError] = useState(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLoading(true);
        setLoadingMessage(`Reading ${file.name} and extracting entities (names, places, organizations)...`);
        setError(null);
        setSuccessMessage("");
        try {
            const uploadedDoc = await uploadDocument(file);
            onGraphUpdate();
            const count = uploadedDoc?.properties?.entities_found || 0;
            setSuccessMessage(`Successfully processed "${file.name}"! Extracted ${count} entities onto the map.`);
            if (uploadedDoc) {
                onNodeSelect(uploadedDoc);
            }
        } catch (err) {
            setError('Failed to upload document and extract entities.');
            console.error(err);
        } finally {
            setLoading(false);
            setLoadingMessage("");
            // Reset the file input value so the same file can be re-uploaded if desired
            e.target.value = "";
        }
    };

    const fetchWikiData = async (title) => {
        if (!title.trim()) return;

        setLoading(true);
        setLoadingMessage(`Initializing import for '${title}' (Limit: ${importLimit})...`);
        setError(null);
        setSuccessMessage("");

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

    const getNodeIcon = (type) => {
        switch (type) {
            case 'Person': return '👤';
            case 'Location': return '📍';
            case 'Organization': return '🏢';
            case 'Document': return '📄';
            case 'Event': return '📅';
            case 'Technology': return '💻';
            case 'Work': return '🎬';
            default: return '🌐';
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
                                <div className="flex items-center gap-1.5">
                                    <span className="text-base">{getNodeIcon(selectedNode.type)}</span>
                                    <h4 className="font-bold text-lg text-blue-300 leading-tight">{selectedNode.label}</h4>
                                </div>
                                <div className="text-gray-300 text-xs mt-0.5 inline-block px-1.5 py-0.5 rounded bg-gray-800/80 border border-gray-600">
                                    {selectedNode.type}
                                </div>
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

                        {/* Entity Breakdown for Document Nodes */}
                        {selectedNode.type === 'Document' && selectedNode.properties?.entity_breakdown && (
                            <div className="my-2 p-2 bg-gray-800/60 rounded border border-gray-600/50">
                                <div className="text-xs font-semibold text-gray-300 mb-1">
                                    Extracted Entities ({selectedNode.properties.entities_found || 0}):
                                </div>
                                <div className="flex flex-wrap gap-1.5 text-xs">
                                    {Object.entries(selectedNode.properties.entity_breakdown).map(([type, cnt]) => (
                                        <span key={type} className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-200 text-[11px]">
                                            {getNodeIcon(type)} {cnt} {type}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Context Quote for Extracted Entities */}
                        {selectedNode.properties?.context && (
                            <div className="my-2 p-2 bg-gray-800/80 rounded border-l-2 border-blue-400 text-xs italic text-gray-300">
                                "{selectedNode.properties.context}"
                            </div>
                        )}

                        {selectedNode.properties && (
                            <div className="mt-2 space-y-1">
                                {Object.entries(selectedNode.properties).map(([key, value]) => {
                                    if (key === 'entity_breakdown' || key === 'context') return null;
                                    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                                    const isUrl = strValue.startsWith('http://') || strValue.startsWith('https://');
                                    return (
                                        <div key={key} className="break-all text-xs">
                                            <span className="text-gray-400 font-medium">{key}:</span>{' '}
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
                        {['Person', 'Location', 'Organization', 'Event', 'Technology', 'Work', 'Document', 'WikipediaPage'].map(type => (
                            <div key={type} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id={`filter-${type}`}
                                    checked={activeTypes && activeTypes.has(type)}
                                    onChange={() => onToggleType(type)}
                                    className="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800 h-3 w-3"
                                />
                                <label htmlFor={`filter-${type}`} className="text-gray-300 text-xs cursor-pointer select-none truncate flex items-center gap-1">
                                    <span>{getNodeIcon(type)}</span>
                                    <span>{type}</span>
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Connected Nodes */}
                {selectedNode && connectedNodes && connectedNodes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="text-gray-400 font-semibold mb-2 uppercase text-xs tracking-wider">Connections ({connectedNodes.length})</h4>
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {connectedNodes.map((node, idx) => {
                                const isHighlighted = highlightedLinkId === node.linkId;
                                return (
                                    <div
                                        key={`${node.id}-${idx}`}
                                        onClick={() => onConnectionClick ? onConnectionClick(node) : onNodeSelect(node)}
                                        className={`p-2.5 rounded cursor-pointer transition-all border ${
                                            isHighlighted
                                                ? 'bg-blue-950/80 border-blue-400 ring-2 ring-blue-500/40 shadow-lg shadow-blue-950/50'
                                                : 'bg-gray-900/60 hover:bg-gray-700/70 border-gray-700/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <span className={`text-xs font-bold ${isHighlighted ? 'text-blue-300' : 'text-blue-400'}`}>
                                                    {node.direction === 'out' ? '→' : '←'}
                                                </span>
                                                <span className="text-sm">{getNodeIcon(node.type)}</span>
                                                <span className="text-blue-300 text-sm font-semibold truncate group-hover:text-blue-200">
                                                    {node.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {node.relation && (
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                                        isHighlighted
                                                            ? 'bg-blue-600 text-white border-blue-400 font-medium'
                                                            : 'bg-blue-950/70 text-blue-300 border border-blue-800/60'
                                                    }`}>
                                                        {node.relation}
                                                    </span>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onNodeSelect(node);
                                                    }}
                                                    className="text-[11px] text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-1.5 py-0.5 rounded border border-gray-600 transition-colors flex items-center gap-0.5"
                                                    title="Switch selection to this entity"
                                                >
                                                    <span>View</span>
                                                    <ExternalLink size={10} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="text-gray-400 text-[11px] mt-0.5 ml-5 flex items-center justify-between">
                                            <span>{node.type}</span>
                                            {isHighlighted && (
                                                <span className="text-blue-400 text-[10px] font-medium">
                                                    • Highlighted on map
                                                </span>
                                            )}
                                        </div>

                                        {/* Relationship Explanation Field */}
                                        {node.explanation && (
                                            <div className={`mt-2 ml-1 text-xs p-2 rounded border-l-2 font-normal leading-relaxed ${
                                                isHighlighted
                                                    ? 'bg-blue-950/90 text-blue-100 border-blue-400'
                                                    : 'bg-gray-950/60 text-gray-200 border-indigo-400'
                                            }`}>
                                                <span className={`text-[10px] uppercase font-bold block mb-0.5 tracking-wider ${
                                                    isHighlighted ? 'text-blue-300' : 'text-indigo-300'
                                                }`}>
                                                    Relationship ({node.relation || 'links_to'}):
                                                </span>
                                                "{node.explanation}"
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
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
                    <label className="block text-xs mb-1 text-green-300 font-bold">Import Document (PDF / DOCX / Text)</label>
                    <div className="relative">
                        <input
                            type="file"
                            accept=".pdf,.docx,.txt"
                            onChange={handleFileUpload}
                            className="hidden"
                            id="file-upload"
                            disabled={loading}
                        />
                        <label
                            htmlFor="file-upload"
                            className={`flex items-center justify-center gap-2 w-full bg-gray-700 hover:bg-gray-600 border border-gray-600 border-dashed rounded px-4 py-2 cursor-pointer transition-colors ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Upload size={16} />
                            <span>Upload PDF / Document</span>
                        </label>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                        Automatically reads pages, identifies names, places, and organizations, and maps connections.
                    </p>
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

                {error && <div className="text-red-400 mt-2 text-xs">{error}</div>}
                {successMessage && (
                    <div className="text-green-300 mt-2 text-xs flex items-start gap-1 bg-green-950/40 p-2 rounded border border-green-800/60">
                        <CheckCircle size={14} className="flex-shrink-0 mt-0.5 text-green-400" />
                        <span>{successMessage}</span>
                    </div>
                )}
                {loading && (
                    <div className="mt-2 p-2 bg-gray-800/80 rounded border border-blue-900/40">
                        <div className="text-blue-300 font-semibold animate-pulse text-xs">Processing Document...</div>
                        <div className="text-gray-400 text-xs mt-1">{loadingMessage}</div>
                    </div>
                )}
            </section>

            <div className="text-gray-600 text-xs mt-auto">
                Backend: http://localhost:8000
            </div>
        </div>
    );
};

export default SidePanel;

import React, { useState, useEffect, useCallback } from 'react';
import GraphView from './components/GraphView';
import SidePanel from './components/SidePanel';
import ConfirmationModal from './components/ConfirmationModal';
import { fetchGraph } from './api';
import { PanelRightClose, PanelRightOpen, GripVertical } from 'lucide-react';


function App() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedLinkId, setHighlightedLinkId] = useState(null);
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
  });

  const refreshGraph = useCallback(async () => {
    try {
      const data = await fetchGraph();
      // Transform links to match react-force-graph expectation (source/target)
      const formattedData = {
        nodes: data.nodes,
        links: data.links.map(link => ({
          ...link,
          source: link.source_id,
          target: link.target_id
        }))
      };
      setGraphData(formattedData);
    } catch (error) {
      console.error("Failed to fetch graph data:", error);
    }
  }, []);


  useEffect(() => {
    refreshGraph();
  }, [refreshGraph]);

  const handleNodeClick = (node) => {
    setSelectedNode(node);
    setHighlightedLinkId(null);
  };

  const handleConnectionClick = (connectedNode) => {
    setHighlightedLinkId(prev => (prev === connectedNode.linkId ? null : connectedNode.linkId));
  };

  // Sidebar resize logic
  const [sidebarWidth, setSidebarWidth] = useState(384); // Default 96 * 4 = 384px
  const [isResizing, setIsResizing] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const startResizing = useCallback((mouseDownEvent) => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback((mouseMoveEvent) => {
    if (isResizing) {
      const newWidth = window.innerWidth - mouseMoveEvent.clientX;
      if (newWidth > 200 && newWidth < 800) {
        setSidebarWidth(newWidth);
      }
    }
  }, [isResizing]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Actions
  const performClearGraph = useCallback(async () => {
    try {
      const { deleteGraph } = await import('./api');
      await deleteGraph();
      setGraphData({ nodes: [], links: [] });
      setSelectedNode(null);
      alert("Database cleared successfully!");
    } catch (error) {
      console.error("Failed to clear graph:", error);
      alert("Failed to clear database.");
    }
    closeModal();
  }, []);

  const performDeleteNode = useCallback(async (nodeId) => {
    try {
      const { deleteNode } = await import('./api');
      await deleteNode(nodeId);
      refreshGraph();
      setSelectedNode(null);
    } catch (error) {
      console.error("Failed to delete node:", error);
      alert("Failed to delete node.");
    }
    closeModal();
  }, [refreshGraph]);

  const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

  const handleRequestClearGraph = useCallback(() => {
    setModalConfig({
      isOpen: true,
      title: 'Clear Database',
      message: 'Are you sure you want to delete the entire database? This action cannot be undone.',
      onConfirm: performClearGraph
    });
  }, [performClearGraph]);

  const handleRequestDeleteNode = useCallback((nodeId) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete Node',
      message: 'Are you sure you want to delete this node? All connections to it will also be removed.',
      onConfirm: () => performDeleteNode(nodeId)
    });
  }, [performDeleteNode]);


  // Focus Mode Logic
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Type Filtering Logic
  const allNodeTypes = ['Person', 'Organization', 'Location', 'Event', 'Document', 'WikipediaPage', 'Technology', 'Work', 'Unknown'];
  const [activeTypes, setActiveTypes] = useState(new Set(allNodeTypes));

  const handleToggleType = (type) => {
    setActiveTypes(prev => {
      const getNewSet = () => {
        const next = new Set(prev);
        if (next.has(type)) next.delete(type);
        else next.add(type);
        return next;
      };

      const next = getNewSet();
      // If user unchecks everything, maybe just leave it empty (shows nothing)
      return next;
    });
  };


  // Helper to safely get ID from node object or ID string/number
  const getId = (node) => (typeof node === 'object' && node !== null ? node.id : node);

  // Filter graph data based on Focus Mode AND Node Type
  const displayedGraphData = React.useMemo(() => {
    // 1. Filter by Node Type first
    const typeFilteredNodes = graphData.nodes.filter(n => {
      const type = n.type || 'Unknown';
      // Check if exact type is known, otherwise check 'Unknown' or maybe loose matching?
      // For now, let's stick to the list. If type is not in list, maybe map it to Unknown or keep it if 'Unknown' is checked?
      // Let's rely on strict checking for the standard types, and maybe a catch-all if needed.
      // Actually, let's just check if the type is in our set. 
      // If a new type appears, it won't be in activeTypes by default unless we fix that.
      // Better: Initialize activeTypes with all *currently existing* types in graphData? 
      // Or just hardcode the standard ones. 
      // Let's revert to: check if the type is active.
      return activeTypes.has(type) || (activeTypes.has('Unknown') && !allNodeTypes.includes(type));
    });

    const typeFilteredNodeIds = new Set(typeFilteredNodes.map(n => n.id));

    // Filter links: both source and target must be visible
    const typeFilteredLinks = graphData.links.filter(l => {
      const s = getId(l.source);
      const t = getId(l.target);
      return typeFilteredNodeIds.has(s) && typeFilteredNodeIds.has(t);
    });

    // Intermediate data
    let filteredData = { nodes: typeFilteredNodes, links: typeFilteredLinks };


    // 2. Apply Focus Mode if active
    if (!isFocusMode || !selectedNode) return filteredData;

    // ... (Focus Mode logic using filteredData) ...
    const connectedLinkIds = new Set();
    const connectedNodeIds = new Set();

    // Only proceed if selectedNode itself is visible!
    if (!typeFilteredNodeIds.has(selectedNode.id)) {
      // If selected node is hidden by type filter, show nothing or just the empty filteredData?
      // Maybe better to just clear selection or shows nothing?
      return { nodes: [], links: [] };
    }

    connectedNodeIds.add(selectedNode.id);

    filteredData.links.forEach(link => {
      const sourceId = getId(link.source);
      const targetId = getId(link.target);

      if (sourceId === selectedNode.id || targetId === selectedNode.id) {
        connectedLinkIds.add(link.id);
        connectedLinkIds.add(link);
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
      }
    });

    return {
      nodes: filteredData.nodes.filter(n => connectedNodeIds.has(n.id)),
      links: filteredData.links.filter(l => connectedLinkIds.has(l.id) || connectedLinkIds.has(l))
    };
  }, [graphData, selectedNode, isFocusMode, activeTypes]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white relative">

      <div className="flex-grow h-full relative min-w-0">
        <GraphView
          graphData={displayedGraphData}
          selectedNode={selectedNode}
          highlightedLinkId={highlightedLinkId}
          onNodeClick={handleNodeClick}
          onLinkClick={(link) => setHighlightedLinkId(prev => prev === link.id ? null : link.id)}
        />

        {/* Toggle Button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute top-4 right-4 z-50 bg-gray-800 p-2 rounded-md shadow-lg border border-gray-700 hover:bg-gray-700 transition-colors"
        >
          {isSidebarOpen ? <PanelRightClose size={20} /> : <PanelRightOpen size={20} />}
        </button>
      </div>

      {/* Resizer Handle */}
      {isSidebarOpen && (
        <div
          className="w-1 cursor-col-resize bg-gray-700 hover:bg-blue-500 transition-colors z-20 flex items-center justify-center"
          onMouseDown={startResizing}
        >
          <GripVertical size={12} className="text-gray-500" />
        </div>
      )}

      {/* Sidebar */}
      {isSidebarOpen && (
        <div
          className="border-l border-gray-700 bg-gray-800 p-4 shadow-xl z-30 overflow-y-auto flex-shrink-0"
          style={{ width: sidebarWidth }}
        >
          <SidePanel
            selectedNode={selectedNode}
            highlightedLinkId={highlightedLinkId}
            onConnectionClick={handleConnectionClick}
            connectedNodes={selectedNode ? graphData.links
              .filter(link => getId(link.source) === selectedNode.id || getId(link.target) === selectedNode.id)
              .map(link => {
                const sourceId = getId(link.source);
                const isSource = sourceId === selectedNode.id;
                const otherNode = isSource ? link.target : link.source;
                // If link.target/source is still an ID, we need to find the node object
                let nodeObj = otherNode;
                if (typeof otherNode !== 'object') {
                  nodeObj = graphData.nodes.find(n => n.id === otherNode) || { id: otherNode, label: "Loading...", type: "Unknown" };
                }

                return {
                  ...nodeObj,
                  relation: link.relation,
                  direction: isSource ? 'out' : 'in',
                  linkId: link.id,
                  linkProperties: link.properties || {},
                  explanation: link.properties?.explanation || link.properties?.context || link.properties?.description || ''
                };
              })
              : []}
            onNodeSelect={handleNodeClick}
            onGraphUpdate={refreshGraph}
            onGraphClear={handleRequestClearGraph}
            onNodeDelete={handleRequestDeleteNode}
            isFocusMode={isFocusMode}
            onToggleFocus={() => setIsFocusMode(!isFocusMode)}
            activeTypes={activeTypes}
            onToggleType={handleToggleType}
          />


        </div>
      )}

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        onConfirm={modalConfig.onConfirm}
        onCancel={closeModal}
      />
    </div>
  );



}

export default App;

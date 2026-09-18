import React, { useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';

const GraphView = ({ graphData, selectedNode, highlightedLinkId, onNodeClick, onLinkClick }) => {
    const fgRef = useRef();
    const containerRef = useRef();
    const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

    const getId = (node) => (typeof node === 'object' && node !== null ? node.id : node);

    const isLinkHighlighted = (link) => {
        if (!highlightedLinkId) return false;
        return link.id === highlightedLinkId;
    };

    const isLinkConnectedToSelected = (link) => {
        if (!selectedNode) return false;
        const s = getId(link.source);
        const t = getId(link.target);
        return s === selectedNode.id || t === selectedNode.id;
    };

    useEffect(() => {
        if (fgRef.current) {
            // Increase repulsion to spread nodes out (default is around -30)
            fgRef.current.d3Force('charge').strength(-300);
            fgRef.current.d3Force('link').distance(70);
        }
    }, [graphData]);

    // Smoothly focus on highlighted link when selected from sidebar
    useEffect(() => {
        if (!highlightedLinkId || !fgRef.current) return;
        const link = graphData.links.find(l => l.id === highlightedLinkId);
        if (!link || typeof link.source !== 'object' || typeof link.target !== 'object') return;

        const midX = (link.source.x + link.target.x) / 2;
        const midY = (link.source.y + link.target.y) / 2;
        const midZ = (link.source.z + link.target.z) / 2;

        const dx = link.target.x - link.source.x;
        const dy = link.target.y - link.source.y;
        const dz = link.target.z - link.source.z;
        const span = Math.hypot(dx, dy, dz);
        const distance = Math.max(span * 1.5, 60);

        const currentPos = fgRef.current.cameraPosition();
        const currentDist = Math.hypot(currentPos.x - midX, currentPos.y - midY, currentPos.z - midZ) || 1;
        const ratio = distance / currentDist;

        fgRef.current.cameraPosition(
            {
                x: midX + (currentPos.x - midX) * ratio,
                y: midY + (currentPos.y - midY) * ratio,
                z: midZ + (currentPos.z - midZ) * ratio
            },
            { x: midX, y: midY, z: midZ },
            1800
        );
    }, [highlightedLinkId, graphData]);

    useEffect(() => {
        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0) return;
            const entry = entries[0];
            const { width, height } = entry.contentRect;
            setDimensions({ width, height });
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, []);

    // wrapper needed because ForceGraph3D expects a parent with dimensions
    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden">
            <ForceGraph3D
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                key={graphData.nodes.length} // Force re-mount when node count changes (e.g. clear)
                graphData={graphData}

                nodeLabel="label"
                nodeAutoColorBy="type"

                // 3D Nodes using Sprites
                nodeThreeObject={node => {
                    // Determine icon
                    let icon = '❓';
                    if (node.type === 'Person') icon = '👤';
                    else if (node.type === 'Organization' || node.type === 'Company') icon = '🏢';
                    else if (node.type === 'Location' || node.type === 'Place') icon = '📍';
                    else if (node.type === 'Event') icon = '📅';
                    else if (node.type === 'Technology') icon = '💻';
                    else if (node.type === 'Work') icon = '🎬';
                    else if (node.type === 'Document') icon = '📄';
                    else if (node.type === 'WikipediaPage') icon = '🌐';

                    const sprite = new SpriteText(`${icon} ${node.label}`);
                    sprite.color = node.color;
                    sprite.textHeight = 8;
                    return sprite;
                }}

                linkDirectionalArrowLength={link => isLinkHighlighted(link) ? 5 : (isLinkConnectedToSelected(link) ? 3 : 2)}
                linkDirectionalArrowRelPos={1}
                linkWidth={link => isLinkHighlighted(link) ? 3.5 : (isLinkConnectedToSelected(link) ? 1.5 : 0.5)}
                linkColor={link => {
                    if (isLinkHighlighted(link)) return '#38bdf8'; // Bright cyan for highlighted link
                    if (isLinkConnectedToSelected(link)) return '#818cf8'; // Soft indigo for connected links
                    return '#4b5563'; // Dim gray for unrelated links
                }}
                linkDirectionalParticles={link => isLinkHighlighted(link) ? 6 : (isLinkConnectedToSelected(link) ? 2 : 0)}
                linkDirectionalParticleWidth={link => isLinkHighlighted(link) ? 2.5 : 1.2}
                linkDirectionalParticleSpeed={link => isLinkHighlighted(link) ? 0.012 : 0.005}
                linkDirectionalParticleColor={link => isLinkHighlighted(link) ? '#38bdf8' : '#c7d2fe'}
                linkLabel={link => {
                    const exp = link.properties?.explanation || link.properties?.context || link.properties?.description;
                    return exp ? `${link.relation || 'links_to'}: ${exp}` : (link.relation || '');
                }}

                onLinkClick={link => {
                    if (onLinkClick) onLinkClick(link);
                }}

                onNodeClick={node => {
                    // 3D graph camera focus
                    const distance = 40;
                    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);

                    fgRef.current.cameraPosition(
                        { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // new position
                        node, // lookAt ({ x, y, z })
                        3000  // ms transition duration
                    );
                    onNodeClick(node);
                }}

                onNodeRightClick={node => {
                    if (node.properties && node.properties.url) {
                        window.open(node.properties.url, '_blank');
                    }
                }}

                backgroundColor="#000000" // Black
                controlType="orbit" // Orbit controls allow rotation
            />
        </div>
    );
};

export default GraphView;


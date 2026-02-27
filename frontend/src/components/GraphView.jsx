import React, { useRef, useEffect } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import SpriteText from 'three-spritetext';

const GraphView = ({ graphData, onNodeClick }) => {
    const fgRef = useRef();
    const containerRef = useRef();
    const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

    useEffect(() => {
        if (fgRef.current) {
            // Increase repulsion to spread nodes out (default is around -30)
            fgRef.current.d3Force('charge').strength(-300);
            fgRef.current.d3Force('link').distance(70);
        }
    }, [graphData]);

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

                linkDirectionalArrowLength={2}
                linkDirectionalArrowRelPos={1}
                linkWidth={0.5}
                linkColor={() => '#9ca3af'} // Lighter gray (Tailwind gray-400)

                // 3D Links (labels are trickier in 3D, skipping for now unless critical)
                // If we want labels, we'd need to add sprites at link midpoints.
                // For now, keeping it clean as per "thin lines" request.

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


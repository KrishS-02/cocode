import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line } from 'react-konva';
import * as Y from 'yjs';
import { MousePointer2, Eraser, Trash2 } from 'lucide-react';

interface PathObject {
    id: string;
    tool: string;
    color: string;
    points: number[];
    strokeWidth: number;
}

interface WhiteboardProps {
    doc: Y.Doc | null;
    isReadOnly?: boolean;
}

const Whiteboard: React.FC<WhiteboardProps> = ({ doc, isReadOnly = false }) => {
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [color, setColor] = useState<string>('#ffffff');
    const [lines, setLines] = useState<PathObject[]>([]);
    const isDrawing = useRef(false);
    const currentLineId = useRef<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 600 });

    const yLinesRef = useRef<Y.Array<PathObject> | null>(null);

    // Responsive Canvas
    useEffect(() => {
        const updateSize = () => {
            if (containerRef.current) {
                setSize({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };
        updateSize();
        window.addEventListener('resize', updateSize);
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    useEffect(() => {
        if (!doc) return;

        // Get or create Y.Array
        const yLines = doc.getArray<PathObject>('whiteboard-paths');
        yLinesRef.current = yLines;

        // Sync initial state
        setLines(yLines.toArray());

        // Observe changes from other peers
        const observer = () => {
            setLines(yLines.toArray());
        };

        yLines.observe(observer);

        return () => {
            yLines.unobserve(observer);
        };
    }, [doc]);

    const handleMouseDown = (e: any) => {
        if (!yLinesRef.current) return;

        isDrawing.current = true;
        const pos = e.target.getStage().getPointerPosition();
        if (!pos) return;

        const id = Math.random().toString(36).substring(2, 9);
        currentLineId.current = id;

        // Note: For eraser, since we want to clear the canvas, we use destination-out composite mode
        // but Konva handles it well if we just set the tool flag and use it in rendering.
        const newLine: PathObject = {
            id,
            tool,
            color: tool === 'eraser' ? '#0f172a' : color,
            points: [pos.x, pos.y],
            strokeWidth: tool === 'eraser' ? 20 : 5,
        };

        yLinesRef.current.push([newLine]);
    };

    const handleMouseMove = (e: any) => {
        if (!isDrawing.current || isReadOnly || !yLinesRef.current || !currentLineId.current) return;

        const stage = e.target.getStage();
        const point = stage.getPointerPosition();
        if (!point) return;

        const yLines = yLinesRef.current;
        const lastLineIndex = yLines.length - 1;

        // Find our line (should be the last one, but let's be safe)
        if (lastLineIndex >= 0) {
            const line = yLines.get(lastLineIndex);
            if (line.id === currentLineId.current) {
                const newPoints = line.points.concat([point.x, point.y]);
                const newLine = { ...line, points: newPoints };

                yLines.delete(lastLineIndex, 1);
                yLines.insert(lastLineIndex, [newLine]);
            }
        }
    };

    const handleMouseUp = () => {
        isDrawing.current = false;
        currentLineId.current = null;
    };

    const handleClear = () => {
        if (isReadOnly || !yLinesRef.current) return;
        if (window.confirm('Clear the entire whiteboard for everyone?')) {
            const yLines = yLinesRef.current;
            yLines.delete(0, yLines.length);
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 relative w-full overflow-hidden" ref={containerRef}>
            {/* Whiteboard Toolbar */}
            <div className="absolute top-4 left-4 z-10 bg-slate-800 border border-slate-700 rounded-lg p-2 flex flex-col gap-3 shadow-xl">
                {/* Tools */}
                <div className="flex flex-col gap-2">
                    <button
                        className={`p-2 rounded transition-colors ${tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                        onClick={() => setTool('pen')}
                        title="Pen Tool"
                        disabled={isReadOnly}
                    >
                        <MousePointer2 size={18} />
                    </button>
                    <button
                        className={`p-2 rounded transition-colors ${tool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}
                        onClick={() => setTool('eraser')}
                        title="Eraser"
                        disabled={isReadOnly}
                    >
                        <Eraser size={18} />
                    </button>
                </div>

                <div className="w-full h-px bg-slate-700 my-1"></div>

                {/* Colors */}
                <div className="flex flex-col gap-2">
                    {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ffffff'].map(c => (
                        <button
                            key={c}
                            className={`w-8 h-8 rounded-full border-2 transition-transform ${color === c && tool === 'pen' ? 'border-indigo-400 scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c }}
                            onClick={() => { setTool('pen'); setColor(c); }}
                            disabled={isReadOnly}
                        />
                    ))}
                </div>

                <div className="w-full h-px bg-slate-700 my-1"></div>

                {/* Actions */}
                <button
                    className={`p-2 rounded transition-colors text-slate-400 hover:bg-red-500/20 hover:text-red-400`}
                    onClick={handleClear}
                    title="Clear Board"
                    disabled={isReadOnly}
                >
                    <Trash2 size={18} />
                </button>
            </div>

            {/* Canvas */}
            <div className="flex-1 w-full h-full cursor-crosshair">
                <Stage
                    width={size.width}
                    height={size.height}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <Layer>
                        {lines.map((line, i) => (
                            <Line
                                key={line.id || i}
                                points={line.points}
                                stroke={line.color}
                                strokeWidth={line.strokeWidth}
                                tension={0.5}
                                lineCap="round"
                                lineJoin="round"
                                globalCompositeOperation={
                                    line.tool === 'eraser' ? 'destination-out' : 'source-over'
                                }
                            />
                        ))}
                    </Layer>
                </Stage>
            </div>

            {isReadOnly && (
                <div className="absolute bottom-4 right-4 bg-slate-800 text-slate-400 px-3 py-1.5 rounded-full text-xs font-medium border border-slate-700 shadow-lg pointer-events-none">
                    View Only Mode
                </div>
            )}
        </div>
    );
};

export default Whiteboard;

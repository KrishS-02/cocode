import { API_BASE_URL, YJS_WS_URL } from '../config';
import { useState, useEffect, useRef } from 'react';

import { useParams, useNavigate } from 'react-router-dom';
import Editor, { type OnMount } from '@monaco-editor/react';
import axios from 'axios';
import * as Y from 'yjs';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { MonacoBinding } from 'y-monaco';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import CommunicationPanel from '../components/CommunicationPanel';
import ShareModal from '../components/ShareModal';
import Whiteboard from '../components/Whiteboard';
import AiAssistantPanel from '../components/AiAssistantPanel';
import { Save, Play, FileCode, Terminal, Share2, MessageCircle, Plus, PenTool, Bot, Home, LogOut } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface File {
    id: string;
    name: string;
    content: string;
}

interface Environment {
    id: string;
    name: string;
    description: string;
    files: File[];
    whiteboardData?: string;
}

const EditorPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const { subscribe, sendMessage } = useWebSocket();

    // State
    const [environment, setEnvironment] = useState<Environment | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [activeFile, setActiveFile] = useState<File | null>(null);
    const [output, setOutput] = useState<string>('');
    const [isRunning, setIsRunning] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [permission, setPermission] = useState<string | null>(null);
    const [editorInstance, setEditorInstance] = useState<any>(null);

    const [isExamMode, setIsExamMode] = useState(false);
    const [problemStatement, setProblemStatement] = useState('');
    const internalClipboard = useRef('');
    const problemSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Refs kept in sync with state so event listeners always see fresh values
    const isExamModeRef = useRef(false);
    const permissionRef = useRef<string | null>(null);
    // Ref to sendMessage+id so DOM event listeners can call it without stale closure
    const sendViolationRef = useRef<((violationType: string) => void) | null>(null);

    // UI State
    const [isCommunicationOpen, setIsCommunicationOpen] = useState(false);
    const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'code' | 'whiteboard'>('code');

    // Refs
    const editorRef = useRef<any>(null);
    const providerRef = useRef<any>(null); // Use 'any' type to avoid TS issues if HocuspocusProvider isn't perfectly identical to WebsocketProvider
    const docRef = useRef<Y.Doc | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);

    // Computed
    const isReadOnly = permission === 'VIEWER';
    const isAdmin = permission === 'ADMIN';
    const canRun = permission === 'ADMIN';

    // Keep refs in sync so DOM event listeners & Monaco callbacks always have fresh values
    useEffect(() => { isExamModeRef.current = isExamMode; }, [isExamMode]);
    useEffect(() => { permissionRef.current = permission; }, [permission]);
    // Always keep violation sender fresh
    useEffect(() => {
        sendViolationRef.current = (violationType: string) => {
            sendMessage({
                type: 'EXAM_VIOLATION',
                environmentId: id,
                violationType
            });
        };
    }, [sendMessage, id]);

    // Fetch Environment & Permissions
    useEffect(() => {
        if (!id || !token) return;

        const fetchData = async () => {
            try {
                // Fetch Permissions first
                try {
                    const permRes = await axios.get(`${API_BASE_URL}/api/environments/${id}/permissions/me`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    setPermission(permRes.data);
                } catch (err) {
                    console.warn("Failed to fetch permissions, defaulting to viewer", err);
                    setPermission('VIEWER');
                }

                // Fetch Environment
                const envRes = await axios.get(`${API_BASE_URL}/api/environments/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setEnvironment(envRes.data);
                setIsExamMode(envRes.data.isExamMode || false);
                setProblemStatement(envRes.data.problemStatement || '');
                if (envRes.data.files && envRes.data.files.length > 0) {
                    setFiles(envRes.data.files);
                    setActiveFile(envRes.data.files[0]);
                }
            } catch (error: any) {
                console.error("Failed to load environment:", error);
                if (error.response?.status === 404) {
                    toast.error("Environment not found or deleted");
                } else {
                    toast.error("Failed to load environment");
                }
                navigate('/dashboard');
            }
        };

        fetchData();
    }, [id, token]);

    // Listen to real-time updates
    useEffect(() => {
        const unsubscribe = subscribe((data: any) => {
            if (data.type === 'PERMISSION_UPDATED' && data.data.environmentId === id) {
                console.log('Permission updated via WS:', data.data.accessLevel);
                if (data.data.accessLevel === 'REVOKED') {
                    toast.error('Your access to this environment was revoked.');
                    navigate('/dashboard');
                } else {
                    setPermission(data.data.accessLevel);
                    // Only toast if it's not a silent exam-mode lockdown (avoid spam)
                    if (!data.data.examSilent) {
                        toast(`Access updated: ${data.data.accessLevel}`, { icon: '🔐' });
                    }
                }
            }
            if (data.type === 'EXAM_MODE_TOGGLED' && data.data.environmentId === id) {
                setIsExamMode(data.data.isExamMode);
                // Also update problem statement if provided
                if (data.data.problemStatement !== undefined) {
                    setProblemStatement(data.data.problemStatement);
                }
                if (data.data.isExamMode) {
                    toast('🎓 Exam Mode Activated — write access restricted', { duration: 4000 });
                } else {
                    toast('Exam Mode Deactivated', { icon: '✅' });
                }
            }
            if (data.type === 'PROBLEM_STATEMENT_UPDATED' && data.data.environmentId === id) {
                setProblemStatement(data.data.problemStatement);
            }
            if (data.type === 'EXAMINEE_ASSIGNED' && data.data.environmentId === id) {
                toast('📝 You are the Examinee! Read the problem statement and start coding.', {
                    duration: 6000,
                    style: { background: '#4f46e5', color: '#fff', fontWeight: 'bold' }
                });
            }
            // Real-time alert to admin about violations
            if (data.type === 'EXAM_ALERT') {
                toast.error(`⚠️ ${data.data.message}`, {
                    duration: 8000,
                    style: { background: '#7f1d1d', color: '#fca5a5', fontWeight: 'bold', border: '1px solid #dc2626' }
                });
            }
        });
        return () => unsubscribe();
    }, [id, subscribe, navigate]);

    // Anti-Cheat: Visibility change tracking
    useEffect(() => {
        const handleVisibilityChange = () => {
            // Use refs so we always read current exam state, not stale closure
            if (document.hidden && isExamModeRef.current && permissionRef.current === 'EDITOR') {
                toast.error('🚫 Tab switch detected! This has been reported.', { duration: 5000 });
                sendViolationRef.current?.('switched tabs');
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []); // Empty deps — uses refs, no re-registration needed

    const handleUpdateProblem = (newProblem: string) => {
        // Update local state immediately for a smooth typing experience
        setProblemStatement(newProblem);
        // Debounce the API save — only call the API 800ms after the user stops typing
        if (problemSaveTimerRef.current) clearTimeout(problemSaveTimerRef.current);
        if (isAdmin && id) {
            problemSaveTimerRef.current = setTimeout(async () => {
                try {
                    await axios.put(`${API_BASE_URL}/api/environments/${id}/problem`, {
                        problemStatement: newProblem
                    }, { headers: { Authorization: `Bearer ${token}` } });
                } catch (err) {
                    console.error("Failed to update problem", err);
                    toast.error('Failed to save problem statement');
                }
            }, 800);
        }
    };

    // 1. Setup Yjs Doc and Provider independently of the editor
    useEffect(() => {
        if (!id || !token) return;

        // Initialize Doc & Provider if not exists
        if (!docRef.current) {
            docRef.current = new Y.Doc();
            providerRef.current = new HocuspocusProvider({
                url: YJS_WS_URL,
                name: id,
                document: docRef.current,
                token: token
            });

            // Log status
            providerRef.current.on('status', (event: any) => {
                console.log('Yjs Status:', event.status);
            });

            // Dynamically inject CSS for cursors since y-monaco only manages class names
            providerRef.current.awareness.on('change', () => {
                const states = providerRef.current.awareness.getStates();
                let css = '';
                states.forEach((state: any, clientId: number) => {
                    if (state.user && state.user.color) {
                        const color = state.user.color;
                        const name = state.user.name || 'Anonymous';
                        css += `
                            .yRemoteSelection-${clientId} {
                                background-color: ${color}33 !important;
                            }
                            .yRemoteSelectionHead-${clientId}::after {
                                position: absolute;
                                content: '${name}';
                                background-color: ${color};
                                color: white;
                                font-size: 11px;
                                font-weight: bold;
                                font-family: sans-serif;
                                padding: 2px 4px;
                                border-radius: 4px;
                                border-top-left-radius: 0;
                                top: 100%;
                                left: 0;
                                white-space: nowrap;
                                z-index: 1000;
                                pointer-events: none;
                            }
                            .yRemoteSelectionHead-${clientId} {
                                position: relative;
                                border-left: 2px solid ${color} !important;
                                margin-left: -2px;
                                display: inline-block;
                                box-sizing: border-box;
                            }
                        `;
                    }
                });

                let styleNode = document.getElementById('yjs-cursors-style');
                if (!styleNode) {
                    styleNode = document.createElement('style');
                    styleNode.id = 'yjs-cursors-style';
                    document.head.appendChild(styleNode);
                }
                styleNode.innerHTML = css;
            });
        }

        if (docRef.current && environment?.whiteboardData) {
            const doc = docRef.current;
            // Load Whiteboard if empty
            const yLines = doc.getArray('whiteboard-paths');
            if (yLines.length === 0) {
                try {
                    const parsed = JSON.parse(environment.whiteboardData);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Avoid duplicates if another client is also pushing
                        if (yLines.length === 0) {
                            yLines.push(parsed);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse whiteboard data", e);
                }
            }
        }

        return () => {
            // We intentionally keep doc and provider alive for the session
            // They will be cleaned up when the component unmounts entirely (user leaves page).
        };
    }, [id, token, environment]);

    // 1b. Update Awareness User State whenever user object loads
    useEffect(() => {
        if (!providerRef.current || !user || !user.username) return;

        const awareness = providerRef.current.awareness;
        // Only inject color if we don't already have one to prevent flicker
        const existingState = awareness.getLocalState();
        const color = existingState?.color || '#' + Math.floor(Math.random() * 16777215).toString(16);

        awareness.setLocalStateField('user', {
            name: user.username,
            color: color,
            colorLight: color + '33'
        });
        awareness.setLocalStateField('name', user.username);
        awareness.setLocalStateField('color', color);
    }, [user?.username]);


    // 2. Bind Monaco Editor to Yjs
    useEffect(() => {
        if (viewMode !== 'code') return;
        if (!id || !activeFile || !editorInstance || !docRef.current || !providerRef.current) return;

        const model = editorInstance.getModel();
        if (!model) return;

        // Cleanup previous binding
        if (bindingRef.current) {
            bindingRef.current.destroy();
            bindingRef.current = null;
        }

        const doc = docRef.current;
        const provider = providerRef.current;
        const yText = doc.getText(activeFile.id); // Use file ID as distinct text model

        // Initialize Yjs text with file content if it's empty
        if (yText.length === 0 && activeFile.content) {
            yText.insert(0, activeFile.content);
        }

        // Bind to Editor
        bindingRef.current = new MonacoBinding(
            yText,
            model,
            new Set([editorInstance]),
            provider.awareness
        );

        return () => {
            if (bindingRef.current) {
                bindingRef.current.destroy();
                bindingRef.current = null;
            }
        };
    }, [id, activeFile, viewMode, editorInstance]);

    // Handle Editor Mount
    const handleEditorDidMount: OnMount = (editor, _monaco) => {
        editorRef.current = editor;
        setEditorInstance(editor);

        // Track what the user copies FROM WITHIN the editor via keyboard shortcut
        editor.onKeyDown((e: any) => {
            // KeyCode.KeyC = 33 in Monaco enum
            if ((e.metaKey || e.ctrlKey) && e.keyCode === 33) {
                const selection = editor.getSelection();
                if (selection) {
                    internalClipboard.current = editor.getModel()?.getValueInRange(selection) || '';
                }
            }
        });

        // DOM-level paste interception — fires BEFORE Monaco processes the paste,
        // so preventDefault() actually cancels the insertion.
        // We must use refs here because this callback is only created once (not re-created per render).
        const editorDom = editor.getDomNode();
        if (editorDom) {
            editorDom.addEventListener('paste', (e: Event) => {
                const clipboardEvent = e as ClipboardEvent;
                if (!isExamModeRef.current || permissionRef.current !== 'EDITOR') return;

                const pastedText = clipboardEvent.clipboardData?.getData('text/plain') || '';

                // Allow paste only if the text matches what was copied from WITHIN the editor
                if (pastedText.trim() !== '' && pastedText.trim() !== internalClipboard.current.trim()) {
                    clipboardEvent.preventDefault();
                    clipboardEvent.stopPropagation();
                    toast.error('🚫 External paste is blocked in Exam Mode.', { duration: 5000 });
                    // Notify backend — sendMessageRef is used so the violation is sent with the current envId
                    sendViolationRef.current?.('pasted external code');
                }
            }, true); // useCapture = true to intercept before Monaco
        }
    };

    // Run Code
    const handleRun = async () => {
        if (!activeFile || !id) return;
        setIsRunning(true);
        setOutput('Running...');

        try {
            // Get current content from editor
            const code = editorRef.current?.getValue() || activeFile.content;

            const response = await axios.post(`${API_BASE_URL}/api/execute`, {
                code,
                environmentId: id
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setOutput(response.data);
        } catch (error: any) {
            console.error("Execution failed:", error);
            setOutput(error.response?.data || "Execution failed");
        } finally {
            setIsRunning(false);
        }
    };

    // Save File & Whiteboard
    const handleSave = async () => {
        setIsSaving(true);
        try {
            if (activeFile) {
                const content = editorRef.current?.getValue() || "";
                await axios.put(`${API_BASE_URL}/api/files/${activeFile.id}`, {
                    content
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                // Update local file state
                setFiles(files.map(f => f.id === activeFile.id ? { ...f, content } : f));
            }

            // Save whiteboard data
            if (docRef.current) {
                const yLines = docRef.current.getArray('whiteboard-paths');
                const data = JSON.stringify(yLines.toArray());
                await axios.put(`${API_BASE_URL}/api/environments/${id}/whiteboard`, {
                    data
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            toast.success("Saved successfully");
        } catch (error) {
            console.error("Save failed:", error);
            toast.error("Failed to save changes");
        } finally {
            setIsSaving(false);
        }
    };

    // Create New File
    const handleCreateFile = async () => {
        if (!id || !token || !canRun) return; 
        
        const fileName = window.prompt("Enter new file name (e.g., utils.py):");
        if (!fileName || !fileName.trim()) return;

        if (files.some(f => f.name.toLowerCase() === fileName.trim().toLowerCase())) {
            toast.error("A file with this name already exists");
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/api/environments/${id}/files`, {
                name: fileName.trim(),
                content: "# New file"
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const newFile = response.data;
            setFiles([...files, newFile]);
            setActiveFile(newFile);
            toast.success("File created");
        } catch (error) {
            console.error("Failed to create file:", error);
            toast.error("Failed to create file");
        }
    };

    return (
        <div className="flex h-[100dvh] bg-slate-950 text-white overflow-hidden relative">
            {/* Sidebar (File Explorer) */}
            <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <span className="font-semibold text-slate-200">Explorer</span>
                    {canRun && (
                        <button 
                            onClick={handleCreateFile}
                            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors"
                            title="New File"
                        >
                            <Plus size={16} />
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    {files.map(file => (
                        <div
                            key={file.id}
                            onClick={() => setActiveFile(file)}
                            className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${activeFile?.id === file.id ? 'bg-slate-800 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                        >
                            <FileCode size={16} />
                            <span className="text-sm truncate">{file.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col relative z-8 w-full h-full overflow-hidden">
                {/* Header / Toolbar */}
                <div className="h-14 bg-slate-900 flex-shrink-0 border-b border-slate-800 flex items-center justify-between px-4">
                    <div className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <span className="text-slate-500">{environment?.name || 'Loading...'}</span>
                        <span className="text-slate-600">/</span>
                        <span className="text-slate-200">{activeFile?.name || 'No file selected'}</span>
                        {permission && (
                            <span className="ml-4 text-xs bg-slate-800 px-2 py-1 rounded text-slate-400 border border-slate-700">
                                {permission}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700 mr-4">
                            <button
                                onClick={() => setViewMode('code')}
                                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1.5 ${viewMode === 'code' ? 'bg-slate-700 font-medium text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                            >
                                <FileCode size={14} />
                                Code
                            </button>
                            <button
                                onClick={() => setViewMode('whiteboard')}
                                className={`px-3 py-1 text-sm rounded-md transition-colors flex items-center gap-1.5 ${viewMode === 'whiteboard' ? 'bg-slate-700 font-medium text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
                            >
                                <PenTool size={14} />
                                Whiteboard
                            </button>
                        </div>
                        <button
                            onClick={() => { setIsCommunicationOpen(!isCommunicationOpen); setIsAiPanelOpen(false); }}
                            className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors border border-slate-700 mr-2 ${isCommunicationOpen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                        >
                            <MessageCircle size={16} />
                            Chat & Voice
                        </button>

                        <button
                            onClick={() => { setIsAiPanelOpen(!isAiPanelOpen); setIsCommunicationOpen(false); }}
                            className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors border border-slate-700 mr-2 ${isAiPanelOpen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                        >
                            <Bot size={16} />
                            Ask AI
                        </button>

                        {isAdmin && (
                            <button
                                onClick={() => setIsShareModalOpen(true)}
                                className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors border border-slate-700 mr-2"
                            >
                                <Share2 size={16} />
                                Share
                            </button>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving || isReadOnly}
                            className={`bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors border border-slate-700 ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Save size={16} />
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>

                        <button
                            onClick={handleRun}
                            disabled={isRunning || !canRun}
                            className={`bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors shadow-lg shadow-indigo-500/20 ${(!canRun) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Play size={16} />
                            {isRunning ? 'Running...' : 'Run'}
                        </button>

                        <div className="w-px h-6 bg-slate-700 mx-1"></div>

                        <button
                            onClick={() => window.open('/dashboard', '_blank')}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white p-1.5 rounded transition-colors border border-slate-700 mx-1"
                            title="Open Dashboard in New Tab"
                        >
                            <Home size={16} />
                        </button>
                        
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 rounded transition-colors border border-red-500/30 ml-1"
                            title="Leave Environment"
                        >
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>

                {/* Body Area: Split horizontally if Exam Mode */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Problem Statement Panel */}
                    {isExamMode && (
                        <div className="w-1/3 min-w-[250px] border-r border-slate-800 flex flex-col bg-slate-900 border-t border-slate-800 z-10 box-border">
                             <div className="h-8 bg-slate-800 text-xs text-slate-400 flex items-center px-4 font-bold tracking-wider">
                                 PROBLEM STATEMENT
                             </div>
                             <div className="flex-1 p-4 overflow-auto">
                                 {isAdmin ? (
                                    <textarea
                                        className="w-full h-full bg-slate-950 text-slate-200 p-3 rounded border border-slate-700 resize-none font-mono text-sm focus:outline-none focus:border-indigo-500"
                                        value={problemStatement}
                                        onChange={(e) => handleUpdateProblem(e.target.value)}
                                        placeholder="Type problem statement here..."
                                    />
                                 ) : (
                                    <div className="text-slate-200 whitespace-pre-wrap font-sans leading-relaxed text-sm">
                                        {problemStatement || "Wait for the admin to provide the problem statement."}
                                    </div>
                                 )}
                             </div>
                        </div>
                    )}

                    {/* Original Editor + Terminal Container */}
                    <div className="flex-1 relative flex flex-col min-w-0">
                        {/* Editor Area */}
                        <div className="flex-1 relative bg-slate-950 flex border-t border-slate-800">
                            {viewMode === 'code' ? (
                                <Editor
                                    height="100%"
                                    defaultLanguage="python"
                                    theme="vs-dark"
                                    defaultValue="// Loading..."
                                    value={activeFile?.content} // Only for initial load, Yjs takes over
                                    onMount={handleEditorDidMount}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        padding: { top: 16 },
                                        readOnly: isReadOnly,
                                        automaticLayout: true,
                                    }}
                                />
                            ) : (
                                <Whiteboard doc={docRef.current} isReadOnly={isReadOnly} />
                            )}
                        </div>
        
                        {/* Terminal / Output */}
                        <div className="h-48 bg-slate-950 border-t border-slate-800 flex flex-col">
                            <div className="bg-slate-900 px-4 py-1.5 text-xs text-slate-400 flex items-center gap-2 select-none border-b border-slate-800">
                                <Terminal size={12} />
                                TERMINAL
                            </div>
                            <div className="flex-1 p-4 font-mono text-sm overflow-auto text-emerald-400 whitespace-pre-wrap bg-slate-950">
                                {output || "Ready to execute..."}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {id && <ShareModal
                environmentId={id}
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
            />}

            {id && user && token && (
                <CommunicationPanel
                    environmentId={id}
                    user={user}
                    token={token}
                    isOpen={isCommunicationOpen}
                    onClose={() => setIsCommunicationOpen(false)}
                />
            )}

            {id && token && (
                <AiAssistantPanel
                    isOpen={isAiPanelOpen}
                    onClose={() => setIsAiPanelOpen(false)}
                    editorInstance={editorInstance}
                    token={token}
                />
            )}
        </div>
    );
};

export default EditorPage;

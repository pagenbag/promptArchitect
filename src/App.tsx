/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  FolderPlus, 
  Plus, 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Folder, 
  FileText, 
  Copy, 
  Trash2, 
  GripVertical, 
  MoreVertical, 
  Search, 
  Settings, 
  Sparkles,
  PanelLeftClose, 
  PanelLeftOpen, 
  Check, 
  PlusCircle,
  Sun,
  Moon,
  Edit2,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  CheckSquare,
  Square,
  Keyboard,
  X,
  Scissors
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Block, Project } from './types';
import { cn } from '@/lib/utils';
import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = 'prompt_architect_data';
const THEME_KEY = 'prompt_architect_theme';
const LAST_PROJECT_KEY = 'prompt_architect_last_project';
const OPEN_TABS_KEY = 'prompt_architect_open_tabs';

function renumberHierarchical(text: string): string {
  const lines = text.split('\n');
  const counters: number[] = [];
  const activeNumbers: number[] = [];
  
  return lines.map(line => {
    const indentMatch = line.match(/^(  )*/);
    const indentLevel = indentMatch ? indentMatch[0].length / 2 : 0;
    
    if (indentLevel === 0) {
      counters.length = 0;
      activeNumbers.length = 0;
      // Remove any list numbering at level 0
      return line.replace(/^(\d+(\.\d+)*\.)\s/, '');
    }

    const idx = indentLevel - 1;
    
    // Reset deeper levels
    if (counters.length > idx + 1) {
      counters.splice(idx + 1);
      activeNumbers.splice(idx + 1);
    }
    
    // Initialize this level if needed
    while (counters.length <= idx) {
      counters.push(1);
      activeNumbers.push(0);
    }
    
    const currentVal = counters[idx];
    activeNumbers[idx] = currentVal;
    counters[idx]++;
    
    // Construct number string using active numbers of parent levels
    const numberParts = [...activeNumbers.slice(0, idx), currentVal];
    const numberStr = numberParts.join('.') + '.';
    
    const cleanContent = line.replace(/^(  )*(\d+(\.\d+)*\.)?/, '').trim();
    return '  '.repeat(indentLevel) + numberStr + ' ' + cleanContent;
  }).join('\n');
}

function ShortcutItem({ keys, label }: { keys: string[], label: string }) {
  return (
    <div className="flex items-center justify-between group">
      <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <div key={i} className="flex items-center">
            <kbd className="min-w-[20px] h-6 px-1.5 flex items-center justify-center bg-muted border border-border rounded text-[10px] font-bold text-foreground shadow-sm">
              {key}
            </kbd>
            {i < keys.length - 1 && <span className="text-[10px] text-muted-foreground/50 mx-0.5">+</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAllCopied, setIsAllCopied] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [editingProjectName, setEditingProjectName] = useState<string | null>(null);
  const [focusBlockId, setFocusBlockId] = useState<string | null>(null);
  const [openProjectIds, setOpenProjectIds] = useState<string[]>([]);
  const [isShortcutsDialogOpen, setIsShortcutsDialogOpen] = useState(false);
  
  // History for Undo/Redo
  const [history, setHistory] = useState<Project[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);
  const lastSavedProjects = useRef<string>('');
  
  // Content Search States
  const [contentSearchQuery, setContentSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<{ blockId: string, start: number, end: number }[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Dialog states
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentId, setTargetParentId] = useState<string | null>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }), []);

  // History Management
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevProjects = history[historyIndex - 1];
      isUndoRedoAction.current = true;
      setProjects(prevProjects);
      setHistoryIndex(historyIndex - 1);
      lastSavedProjects.current = JSON.stringify(prevProjects);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextProjects = history[historyIndex + 1];
      isUndoRedoAction.current = true;
      setProjects(nextProjects);
      setHistoryIndex(historyIndex + 1);
      lastSavedProjects.current = JSON.stringify(nextProjects);
    }
  }, [history, historyIndex]);

  // Load data from localStorage
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    const savedTheme = localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null;
    
    if (savedTheme) {
      setTheme(savedTheme);
    }

    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setProjects(parsed);
        
        const savedTabs = localStorage.getItem(OPEN_TABS_KEY);
        if (savedTabs) {
          const tabIds = JSON.parse(savedTabs);
          // Filter out any IDs that might have been deleted
          const validTabIds = tabIds.filter((id: string) => parsed.some((p: Project) => p.id === id));
          setOpenProjectIds(validTabIds);
        }

        const lastSelectedId = localStorage.getItem(LAST_PROJECT_KEY);
        if (lastSelectedId && parsed.some((p: Project) => p.id === lastSelectedId)) {
          setSelectedProjectId(lastSelectedId);
          // Ensure it's in open tabs
          setOpenProjectIds(prev => prev.includes(lastSelectedId) ? prev : [...prev, lastSelectedId]);
        } else if (parsed.length > 0) {
          setSelectedProjectId(parsed[0].id);
          setOpenProjectIds([parsed[0].id]);
        }
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    } else {
      // Create a default project
      const defaultProject: Project = {
        id: crypto.randomUUID(),
        name: 'Welcome Project',
        parentId: null,
        blocks: [
          { id: crypto.randomUUID(), content: '# Welcome to Prompt Architect\n\nThis is a block-based prompt manager. You can organize your AI agent instructions into structured projects.' },
          { id: crypto.randomUUID(), content: '## How to use:\n\n1. Create folders in the sidebar to organize projects.\n2. Add blocks to your project to separate different parts of your prompt.\n3. Hover over a block to copy it individually, or use "Copy All" to get the whole prompt.' }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setProjects([defaultProject]);
      setSelectedProjectId(defaultProject.id);
      setOpenProjectIds([defaultProject.id]);
    }
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Tab switching: Alt+ArrowRight and Alt+ArrowLeft
      if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const currentIndex = openProjectIds.indexOf(selectedProjectId || '');
        if (currentIndex !== -1) {
          let nextIndex;
          if (e.key === 'ArrowLeft') {
            nextIndex = (currentIndex - 1 + openProjectIds.length) % openProjectIds.length;
          } else {
            nextIndex = (currentIndex + 1) % openProjectIds.length;
          }
          setSelectedProjectId(openProjectIds[nextIndex]);
        }
      }

      // Tab selection: Alt+1 to Alt+9
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key) - 1;
        if (index < openProjectIds.length) {
          e.preventDefault();
          setSelectedProjectId(openProjectIds[index]);
        }
      }

      // Close tab: Ctrl+W (Note: browser might block this, but good to have)
      if (e.ctrlKey && e.key === 'w') {
        if (selectedProjectId) {
          e.preventDefault();
          handleCloseTab(selectedProjectId);
        }
      }

      // Search: Ctrl+F
      if (e.ctrlKey && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // Undo: Ctrl+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        // Only trigger global undo if not in a textarea or if we want to override
        // For now, let's allow it to be global
        e.preventDefault();
        undo();
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [openProjectIds, selectedProjectId, undo, redo]);

  // Theme effect
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Save data to localStorage
  useEffect(() => {
    if (projects.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    }
  }, [projects]);

  // History Management Effect
  useEffect(() => {
    if (projects.length === 0) return;
    
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const currentStr = JSON.stringify(projects);
      if (currentStr !== lastSavedProjects.current) {
        setHistory(prev => {
          const newHistory = prev.slice(0, historyIndex + 1);
          const updatedHistory = [...newHistory, projects];
          if (updatedHistory.length > 50) return updatedHistory.slice(1);
          return updatedHistory;
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
        lastSavedProjects.current = currentStr;
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [projects, historyIndex]);

  // Save last selected project
  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem(LAST_PROJECT_KEY, selectedProjectId);
    }
  }, [selectedProjectId]);

  // Save open tabs
  useEffect(() => {
    localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(openProjectIds));
  }, [openProjectIds]);

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId) || null
  , [projects, selectedProjectId]);

  const projectPath = useMemo(() => {
    if (!selectedProjectId) return [];
    const path: Project[] = [];
    let currentId: string | null = selectedProjectId;
    while (currentId) {
      const project = projects.find(p => p.id === currentId);
      if (project) {
        path.unshift(project);
        currentId = project.parentId;
      } else {
        currentId = null;
      }
    }
    return path;
  }, [projects, selectedProjectId]);

  // Content Search Logic
  useEffect(() => {
    if (!contentSearchQuery || !selectedProject) {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }

    const matches: { blockId: string, start: number, end: number }[] = [];
    const query = contentSearchQuery.toLowerCase();

    selectedProject.blocks.forEach(block => {
      const content = block.content.toLowerCase();
      let pos = content.indexOf(query);
      while (pos !== -1) {
        matches.push({
          blockId: block.id,
          start: pos,
          end: pos + query.length
        });
        pos = content.indexOf(query, pos + 1);
      }
    });

    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
  }, [contentSearchQuery, selectedProject]);

  const navigateSearch = (direction: 'next' | 'prev') => {
    if (searchMatches.length === 0) return;

    let nextIndex;
    if (direction === 'next') {
      nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    } else {
      nextIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    }

    setCurrentMatchIndex(nextIndex);
    const match = searchMatches[nextIndex];
    
    // Focus and scroll to block
    setFocusBlockId(match.blockId);
    
    // We need to wait for the block to be focused and then select the text
    // This will be handled by an effect in BlockItem or by passing props
  };

  // Scroll to bottom when project changes
  useEffect(() => {
    if (selectedProject && scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]');
      if (viewport) {
        // Use a slightly longer timeout to ensure content is rendered
        setTimeout(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'instant' });
          // Focus the last block
          const lastBlock = selectedProject.blocks[selectedProject.blocks.length - 1];
          if (lastBlock) {
            // Reset focus first to ensure the effect triggers
            setFocusBlockId(null);
            setTimeout(() => {
              setFocusBlockId(lastBlock.id);
            }, 10);
          }
        }, 50);
      }
    }
  }, [selectedProjectId]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleOpenProject = (id: string, forceNewTab = false) => {
    if (forceNewTab) {
      if (!openProjectIds.includes(id)) {
        setOpenProjectIds(prev => [...prev, id]);
      }
      setSelectedProjectId(id);
    } else {
      if (openProjectIds.includes(id)) {
        setSelectedProjectId(id);
      } else {
        setOpenProjectIds(prev => [...prev, id]);
        setSelectedProjectId(id);
      }
    }
  };

  const handleCloseTab = (id: string, e?: any) => {
    if (e) e.stopPropagation();
    
    const newOpenIds = openProjectIds.filter(openId => openId !== id);
    setOpenProjectIds(newOpenIds);
    
    if (selectedProjectId === id) {
      if (newOpenIds.length > 0) {
        setSelectedProjectId(newOpenIds[newOpenIds.length - 1]);
      } else {
        setSelectedProjectId(null);
      }
    }
  };

  const handleCopyAll = () => {
    if (!selectedProject) return;
    const allText = selectedProject.blocks.map(b => b.content).join('\n\n');
    navigator.clipboard.writeText(allText);
    setIsAllCopied(true);
    setTimeout(() => setIsAllCopied(false), 2000);
  };

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleAddFolder = (parentId: string | null = null) => {
    setTargetParentId(parentId);
    setNewFolderName('');
    setIsNewFolderDialogOpen(true);
  };

  const confirmAddFolder = () => {
    if (!newFolderName.trim()) return;

    const newProject: Project = {
      id: crypto.randomUUID(),
      name: newFolderName,
      parentId: targetParentId,
      blocks: [{ id: crypto.randomUUID(), content: '' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setProjects(prev => [...prev, newProject]);
    setSelectedProjectId(newProject.id);
    if (targetParentId) {
      const newExpanded = new Set(expandedFolders);
      newExpanded.add(targetParentId);
      setExpandedFolders(newExpanded);
    }
    setIsNewFolderDialogOpen(false);
  };

  const handleDeleteProject = (id: string) => {
    // Also delete children recursively
    const idsToDelete = new Set([id]);
    const findChildren = (parentId: string) => {
      projects.forEach(p => {
        if (p.parentId === parentId) {
          idsToDelete.add(p.id);
          findChildren(p.id);
        }
      });
    };
    findChildren(id);

    setProjects(prev => prev.filter(p => !idsToDelete.has(p.id)));
    setOpenProjectIds(prev => prev.filter(id => !idsToDelete.has(id)));
    
    if (selectedProjectId && idsToDelete.has(selectedProjectId)) {
      const remainingTabs = openProjectIds.filter(id => !idsToDelete.has(id));
      if (remainingTabs.length > 0) {
        setSelectedProjectId(remainingTabs[remainingTabs.length - 1]);
      } else {
        setSelectedProjectId(null);
      }
    }
  };

  const updateProjectBlocks = (projectId: string, blocks: Block[]) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, blocks, updatedAt: Date.now() } : p
    ));
  };

  const updateProjectName = (projectId: string, name: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, name, updatedAt: Date.now() } : p
    ));
  };

  const addBlock = (projectId: string, index: number) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newBlock: Block = { id: crypto.randomUUID(), content: '' };
    const newBlocks = [...project.blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    updateProjectBlocks(projectId, newBlocks);
    setFocusBlockId(newBlock.id);
  };

  const splitBlock = (projectId: string, index: number, content: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newBlock: Block = { id: crypto.randomUUID(), content };
    const newBlocks = [...project.blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    updateProjectBlocks(projectId, newBlocks);
    setFocusBlockId(newBlock.id);
  };

  const deleteBlock = (projectId: string, blockId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project || project.blocks.length <= 1) return;

    const newBlocks = project.blocks.filter(b => b.id !== blockId);
    updateProjectBlocks(projectId, newBlocks);
  };

  const updateBlockContent = (projectId: string, blockId: string, content: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newBlocks = project.blocks.map(b => 
      b.id === blockId ? { ...b, content, isDirty: true } : b
    );
    updateProjectBlocks(projectId, newBlocks);
  };

  const generateBlockDescription = async (projectId: string, blockId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const block = project.blocks.find(b => b.id === blockId);
    if (!block || !block.content.trim() || !block.isDirty) return;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Generate a short (2-8 words) description of the following content. Examples: "Add search bar", "Fix auto indentation", "Update styles". Content: ${block.content}`,
      });
      
      const description = response.text?.trim().replace(/^["']|["']$/g, '');
      if (description) {
        const newBlocks = project.blocks.map(b => 
          b.id === blockId ? { ...b, description, isDirty: false } : b
        );
        updateProjectBlocks(projectId, newBlocks);
      }
    } catch (error) {
      console.error("Failed to generate description:", error);
    }
  };

  const expandPromptWithAI = async (projectId: string, blockId: string, selectedText?: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const block = project.blocks.find(b => b.id === blockId);
    if (!block) return;

    const textToExpand = selectedText || block.content;
    if (!textToExpand.trim()) return;

    // Set thinking state
    updateProjectBlocks(projectId, project.blocks.map(b => 
      b.id === blockId ? { ...b, isThinking: true } : b
    ));

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Expand the following text into clear, concise, and structured instructions that an AI agent can use to build the described feature or perform the actions. Use markdown if appropriate. IMPORTANT: Do not include any introductory or filler text (e.g., "Here is a structured set of instructions..."). Start directly with the instructions. Text: ${textToExpand}`,
      });

      const expandedText = response.text?.trim();
      if (expandedText) {
        const newBlocks = project.blocks.map(b => {
          if (b.id === blockId) {
            let newContent = b.content;
            if (selectedText) {
              newContent = b.content.replace(selectedText, expandedText);
            } else {
              newContent = expandedText;
            }
            return { ...b, content: newContent, isThinking: false, isDirty: true };
          }
          return b;
        });
        updateProjectBlocks(projectId, newBlocks);
      }
    } catch (error) {
      console.error("Failed to expand prompt:", error);
      updateProjectBlocks(projectId, project.blocks.map(b => 
        b.id === blockId ? { ...b, isThinking: false } : b
      ));
    }
  };

  const toggleBlockDone = (projectId: string, blockId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const newBlocks = project.blocks.map(b => 
      b.id === blockId ? { ...b, isDone: !b.isDone } : b
    );
    updateProjectBlocks(projectId, newBlocks);
  };

  const renderTree = (parentId: string | null = null, level = 0) => {
    const items = projects.filter(p => p.parentId === parentId)
      .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return items.map(item => {
      const isExpanded = expandedFolders.has(item.id);
      const hasChildren = projects.some(p => p.parentId === item.id);
      const isSelected = selectedProjectId === item.id;

      return (
        <div key={item.id} className="flex flex-col">
          <div 
            className={cn(
              "group flex items-center py-2 px-3 rounded-sm cursor-pointer transition-all duration-200",
              isSelected 
                ? "bg-muted text-foreground font-bold shadow-sm" 
                : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={(e) => handleOpenProject(item.id, e.ctrlKey || e.metaKey)}
          >
            <div 
              className="p-1 hover:bg-white/10 rounded-sm mr-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(item.id);
              }}
            >
              {hasChildren ? (
                isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : (
                <div className="w-[14px] flex items-center justify-center">
                  <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-foreground/50" : "bg-muted-foreground/30")} />
                </div>
              )}
            </div>
            <span className="text-[13px] truncate flex-1 tracking-wide">{item.name}</span>
            
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddFolder(item.id);
                }}
              >
                <Plus size={12} />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-accent" onClick={e => e.stopPropagation()}>
                      <MoreVertical size={12} />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="bg-popover border-border">
                  <DropdownMenuItem onClick={() => handleDeleteProject(item.id)} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <AnimatePresence initial={false}>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {renderTree(item.id, level + 1)}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });
  };

  return (
    <TooltipProvider>
      <div className="flex h-screen bg-background text-foreground font-sans selection:bg-blue-500/30">
        {/* Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
          className="h-full border-r border-border flex flex-col overflow-hidden bg-muted/20 shrink-0"
        >
          <div className="p-6 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 font-serif italic text-2xl tracking-wider text-foreground font-black">
              Architect
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="text-muted-foreground">
              <PanelLeftClose size={18} />
            </Button>
          </div>

          <div className="px-4 mt-6 mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search projects..." 
                className="pl-8 bg-background/30 h-9 border-border focus:border-accent transition-colors"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 px-3">
            <ScrollArea className="h-full">
              <div className="space-y-1">
                <div className="flex items-center justify-between px-3 mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[2px]">Projects</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-accent" onClick={() => handleAddFolder(null)}>
                    <PlusCircle size={14} />
                  </Button>
                </div>
                {renderTree(null)}
              </div>
            </ScrollArea>
          </div>

          <div className="p-4 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-accent">
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsShortcutsDialogOpen(true)}
                className="text-muted-foreground hover:text-accent"
              >
                <Keyboard size={18} />
              </Button>
            </div>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent">
              <Settings size={18} />
            </Button>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden">
          {!isSidebarOpen && (
            <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col items-center py-4 border-r border-border bg-muted/10 z-30">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-muted-foreground hover:text-accent"
                onClick={() => setIsSidebarOpen(true)}
              >
                <PanelLeftOpen size={18} />
              </Button>
            </div>
          )}

          <div className={cn("flex-1 flex flex-col min-w-0", !isSidebarOpen && "pl-12")}>
            {/* Tab Bar */}
            {openProjectIds.length > 0 && (
              <div className="flex items-center bg-muted/30 border-b border-border h-10 px-4 gap-1 overflow-x-auto no-scrollbar shrink-0">
                {openProjectIds.map((id, index) => {
                  const project = projects.find(p => p.id === id);
                  if (!project) return null;
                  const isActive = selectedProjectId === id;
                  return (
                    <div 
                      key={id}
                      className={cn(
                        "flex items-center h-8 px-3 gap-2 rounded-t-md cursor-pointer transition-all duration-200 min-w-[120px] max-w-[200px] group",
                        isActive 
                          ? "bg-background border-x border-t border-border text-foreground font-medium" 
                          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      )}
                      onClick={() => setSelectedProjectId(id)}
                    >
                      <FileText size={14} className={cn(isActive ? "text-accent" : "text-muted-foreground/50")} />
                      <span className="text-xs truncate flex-1">{project.name}</span>
                      <button 
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded-sm transition-all"
                        onClick={(e) => handleCloseTab(id, e)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedProject ? (
            <>
              <header className="py-10 px-12 border-b border-border flex items-center justify-between bg-background/50 backdrop-blur-md z-20 shrink-0">
                <div className="flex flex-col gap-2 overflow-hidden flex-1 mr-8">
                  <div className="flex items-center flex-wrap gap-2 text-muted-foreground text-[10px] uppercase tracking-[2px] font-bold">
                    <span className="hover:text-foreground cursor-pointer transition-colors" onClick={() => setSelectedProjectId(null)}>Projects</span>
                    {projectPath.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <ChevronRight size={10} className="text-muted-foreground/50" />
                        <span 
                          className={cn(
                            "transition-colors cursor-pointer",
                            i === projectPath.length - 1 ? "text-foreground font-black" : "hover:text-foreground"
                          )}
                          onClick={() => setSelectedProjectId(p.id)}
                        >
                          {p.name}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {editingProjectName !== null ? (
                    <Input 
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      onBlur={() => {
                        if (editingProjectName.trim()) {
                          updateProjectName(selectedProject.id, editingProjectName);
                        }
                        setEditingProjectName(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (editingProjectName.trim()) {
                            updateProjectName(selectedProject.id, editingProjectName);
                          }
                          setEditingProjectName(null);
                        }
                        if (e.key === 'Escape') setEditingProjectName(null);
                      }}
                      autoFocus
                      className="text-4xl h-auto py-0 px-0 border-none focus-visible:ring-0 font-serif font-normal tracking-tight text-foreground bg-transparent"
                    />
                  ) : (
                    <div 
                      className="group flex items-center gap-2 cursor-pointer"
                      onClick={() => setEditingProjectName(selectedProject.name)}
                    >
                      <h1 className="text-4xl font-serif font-normal tracking-tight text-foreground truncate">
                        {selectedProject.name}
                      </h1>
                      <Edit2 size={16} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {/* Content Search Bar */}
                  <div className="relative flex items-center">
                    <div className={cn(
                      "flex items-center bg-muted/50 border border-border rounded-full px-3 py-1 transition-all duration-300",
                      contentSearchQuery ? "w-64 border-accent/50 ring-1 ring-accent/10" : "w-48"
                    )}>
                      <Search size={14} className="text-muted-foreground mr-2" />
                      <input 
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search blocks..."
                        value={contentSearchQuery}
                        onChange={(e) => setContentSearchQuery(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-xs w-full placeholder:text-muted-foreground/50"
                      />
                      {contentSearchQuery && (
                        <div className="flex items-center gap-1 ml-2 border-l border-border pl-2">
                          <span className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">
                            {searchMatches.length > 0 ? `${currentMatchIndex + 1}/${searchMatches.length}` : '0/0'}
                          </span>
                          <div className="flex flex-col -space-y-1">
                            <button 
                              onClick={() => navigateSearch('prev')}
                              className="p-0.5 hover:text-accent transition-colors"
                              disabled={searchMatches.length === 0}
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button 
                              onClick={() => navigateSearch('next')}
                              className="p-0.5 hover:text-accent transition-colors"
                              disabled={searchMatches.length === 0}
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                          <button 
                            onClick={() => setContentSearchQuery('')}
                            className="ml-1 p-0.5 hover:text-destructive transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto-save active</span>
                    <span className="text-[10px] text-muted-foreground/50">Last updated: {new Date(selectedProject.updatedAt).toLocaleTimeString()}</span>
                  </div>
                  <Separator orientation="vertical" className="h-8 mx-2 bg-border" />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-accent text-foreground font-bold hover:bg-accent hover:text-background transition-all duration-300 shadow-sm"
                    onClick={handleCopyAll}
                  >
                    {isAllCopied ? <Check size={14} /> : <Copy size={14} />}
                    {isAllCopied ? 'Copied!' : 'Copy All'}
                  </Button>
                </div>
              </header>

              <ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
                <div className="max-w-5xl mx-auto py-16 px-12 space-y-6">
                {selectedProject.blocks.map((block, index) => (
                    <div key={block.id} className="group relative">
                      {/* Insertion Point Above (only for first block) */}
                      {index === 0 && (
                        <div className="absolute -top-6 left-0 right-0 h-12 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-300 z-10">
                          <div className="absolute left-0 right-0 h-[1px] bg-accent/20" />
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-6 w-6 rounded-full bg-background border-accent text-accent hover:bg-accent hover:text-background z-20 shadow-lg shadow-accent/10"
                            onClick={() => {
                              const newBlocks = [{ id: crypto.randomUUID(), content: '' }, ...selectedProject.blocks];
                              updateProjectBlocks(selectedProject.id, newBlocks);
                            }}
                          >
                            <Plus size={12} />
                          </Button>
                        </div>
                      )}

                      <BlockItem 
                        block={block} 
                        isFocused={focusBlockId === block.id}
                        onFocus={() => setFocusBlockId(block.id)}
                        onUpdate={(content) => updateBlockContent(selectedProject.id, block.id, content)}
                        onDelete={() => deleteBlock(selectedProject.id, block.id)}
                        onToggleDone={() => toggleBlockDone(selectedProject.id, block.id)}
                        onAddBelow={() => addBlock(selectedProject.id, index)}
                        onSplitBlock={(content) => splitBlock(selectedProject.id, index, content)}
                        onDeleteIfEmpty={() => {
                          if (selectedProject.blocks.length > 1) {
                            const prevBlock = selectedProject.blocks[index - 1];
                            deleteBlock(selectedProject.id, block.id);
                            if (prevBlock) {
                              setFocusBlockId(prevBlock.id);
                            }
                          }
                        }}
                        canDelete={selectedProject.blocks.length > 1}
                        onBlur={() => generateBlockDescription(selectedProject.id, block.id)}
                        onAIExpand={(selectedText) => expandPromptWithAI(selectedProject.id, block.id, selectedText)}
                        searchMatches={searchMatches.filter(m => m.blockId === block.id)}
                        activeMatchIndex={
                          currentMatchIndex !== -1 && searchMatches[currentMatchIndex]?.blockId === block.id
                            ? searchMatches.filter(m => m.blockId === block.id).findIndex(m => 
                                m.start === searchMatches[currentMatchIndex].start && 
                                m.end === searchMatches[currentMatchIndex].end
                              )
                            : null
                        }
                      />

                      {/* Insertion Point Below */}
                      <div className="absolute -bottom-6 left-0 right-0 h-12 flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-300 z-10">
                        <div className="absolute left-0 right-0 h-[1px] bg-accent/20" />
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-6 w-6 rounded-full bg-background border-accent text-accent hover:bg-accent hover:text-background z-20 shadow-lg shadow-accent/10"
                          onClick={() => addBlock(selectedProject.id, index)}
                        >
                          <Plus size={12} />
                        </Button>
                      </div>
                    </div>
                  ))}
                  
                  <div className="h-32" /> {/* Spacer */}
                </div>
              </ScrollArea>

              <footer className="h-10 border-t border-border bg-muted/30 px-12 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-medium shrink-0">
                <div className="flex items-center gap-4">
                  <span>{selectedProject.blocks.length} Blocks</span>
                  <Separator orientation="vertical" className="h-3 bg-border" />
                  <span>{selectedProject.blocks.reduce((acc, b) => acc + b.content.length, 0)} Characters</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/50">Ctrl+Enter to add block</span>
                  <Separator orientation="vertical" className="h-3 bg-border" />
                  <span>LocalStorage Engine v1.0</span>
                </div>
              </footer>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
              <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mb-4">
                <FileText size={32} />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">No Project Selected</h2>
              <p className="max-w-xs text-center mb-6">
                Select a project from the sidebar or create a new one to start managing your prompts.
              </p>
              <Button onClick={() => handleAddFolder(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Create New Project
              </Button>
            </div>
          )}
        </div>
      </main>

        {/* Keyboard Shortcuts Dialog */}
        <Dialog open={isShortcutsDialogOpen} onOpenChange={setIsShortcutsDialogOpen}>
          <DialogContent className="max-w-4xl bg-background border-border shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-serif italic tracking-wide">Keyboard Shortcuts</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-12 py-6">
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-[2px] text-accent">Navigation</h3>
                <div className="space-y-3">
                  <ShortcutItem keys={["Alt", "→"]} label="Next Tab" />
                  <ShortcutItem keys={["Alt", "←"]} label="Previous Tab" />
                  <ShortcutItem keys={["Alt", "1-9"]} label="Switch to Tab 1-9" />
                  <ShortcutItem keys={["Ctrl", "F"]} label="Search Blocks" />
                  <ShortcutItem keys={["Ctrl", "W"]} label="Close Current Tab" />
                  <ShortcutItem keys={["Ctrl", "Z"]} label="Undo" />
                  <ShortcutItem keys={["Ctrl", "Y"]} label="Redo" />
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-[2px] text-accent">Editor</h3>
                <div className="space-y-3">
                  <ShortcutItem keys={["Ctrl", "Enter"]} label="Add Block Below" />
                  <ShortcutItem keys={["Tab"]} label="Indent / Hierarchical List" />
                  <ShortcutItem keys={["Shift", "Tab"]} label="Outdent" />
                  <ShortcutItem keys={["Ctrl", "→"]} label="Indent" />
                  <ShortcutItem keys={["Ctrl", "←"]} label="Outdent" />
                  <ShortcutItem keys={["Enter"]} label="Maintain List Level" />
                  <ShortcutItem keys={["Backspace"]} label="Delete Empty Block" />
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
          <DialogContent className="bg-popover border-border">
            <DialogHeader>
              <DialogTitle className="font-serif">Create New Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-xs uppercase tracking-widest text-muted-foreground">Project Name</Label>
                <Input 
                  id="name" 
                  value={newFolderName} 
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Content Generator"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && confirmAddFolder()}
                  className="bg-background/50 border-border focus:border-accent"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsNewFolderDialogOpen(false)}>Cancel</Button>
              <Button onClick={confirmAddFolder} className="bg-accent text-background hover:bg-accent/80">Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

interface BlockItemProps {
  block: Block;
  isFocused: boolean;
  onFocus: () => void;
  onUpdate: (content: string) => void;
  onDelete: () => void;
  onAddBelow: () => void;
  onDeleteIfEmpty: () => void;
  onToggleDone: () => void;
  onSplitBlock: (content: string) => void;
  onBlur: () => void;
  onAIExpand: (selectedText?: string) => void;
  canDelete: boolean;
  searchMatches: { start: number, end: number }[];
  activeMatchIndex: number | null;
}

function BlockItem({ 
  block, isFocused, onFocus, onUpdate, onDelete, onAddBelow, onDeleteIfEmpty, onToggleDone, onSplitBlock, onBlur, onAIExpand, canDelete,
  searchMatches, activeMatchIndex
}: BlockItemProps) {
  const [isCopied, setIsCopied] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIsFocused = useRef(isFocused);
  const prevActiveMatchIndex = useRef(activeMatchIndex);

  useEffect(() => {
    if (isFocused && textareaRef.current) {
      const becameFocused = !prevIsFocused.current && isFocused;
      const matchChanged = activeMatchIndex !== null && prevActiveMatchIndex.current !== activeMatchIndex;

      if (becameFocused || matchChanged) {
        // Only focus if we are navigating search or just clicked the block
        // This prevents stealing focus from the search bar while typing
        if (matchChanged) {
          textareaRef.current.focus();
        }

        if (activeMatchIndex !== null && searchMatches[activeMatchIndex]) {
          const match = searchMatches[activeMatchIndex];
          // Only set selection if it's not already there to avoid cursor resets
          if (textareaRef.current.selectionStart !== match.start || textareaRef.current.selectionEnd !== match.end) {
            textareaRef.current.setSelectionRange(match.start, match.end);
            textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else if (becameFocused) {
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }
    }
    prevIsFocused.current = isFocused;
    prevActiveMatchIndex.current = activeMatchIndex;
  }, [isFocused, activeMatchIndex, searchMatches]);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleMoveToNewBlock = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    if (selectionStart === selectionEnd) return;

    const selectedText = block.content.substring(selectionStart, selectionEnd);
    
    if (!block.isDone) {
      const newContent = block.content.substring(0, selectionStart) + block.content.substring(selectionEnd);
      onUpdate(newContent);
      // Reset selection state after cutting
      setHasSelection(false);
    }
    
    onSplitBlock(selectedText);
  };

  const checkSelection = () => {
    if (textareaRef.current) {
      setHasSelection(textareaRef.current.selectionStart !== textareaRef.current.selectionEnd);
    }
  };

  const renderHighlights = () => {
    if (searchMatches.length === 0) return block.content;

    const result = [];
    let lastIndex = 0;

    // Sort matches by start position
    const sortedMatches = [...searchMatches].sort((a, b) => a.start - b.start);

    sortedMatches.forEach((match, idx) => {
      // Text before match
      result.push(block.content.substring(lastIndex, match.start));
      
      // The match itself
      const isActive = idx === activeMatchIndex;
      result.push(
        <mark 
          key={idx} 
          className={cn(
            "rounded-sm transition-colors duration-200",
            isActive ? "bg-accent text-background" : "bg-accent/30 text-foreground"
          )}
          style={{ 
            fontFamily: 'inherit', 
            fontSize: 'inherit', 
            fontWeight: 'inherit',
            lineHeight: 'inherit',
            letterSpacing: 'inherit',
            padding: '0',
            color: 'transparent'
          }}
        >
          {block.content.substring(match.start, match.end)}
        </mark>
      );
      
      lastIndex = match.end;
    });

    // Remaining text
    result.push(block.content.substring(lastIndex));
    return result;
  };

  const handleAIExpand = () => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    if (selectionStart !== selectionEnd) {
      const selectedText = block.content.substring(selectionStart, selectionEnd);
      onAIExpand(selectedText);
    } else {
      onAIExpand();
    }
  };

  const sharedStyles = "w-full min-h-[140px] p-8 pt-14 text-base font-serif whitespace-pre-wrap break-words border-none ring-0 outline-none transition-none resize-none overflow-hidden block";

  const sharedInlineStyles: React.CSSProperties = {
    fontSize: '1rem', // text-base
    lineHeight: '1.6rem', // adjusted for smaller font
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"liga" 0',
    wordBreak: 'break-word',
    letterSpacing: '0',
    tabSize: '2',
    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    fontWeight: '400',
    margin: '0',
    boxSizing: 'border-box'
  };

  const handleKeyDown = (e: any) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      onAddBelow();
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && block.content === '') {
      e.preventDefault();
      onDeleteIfEmpty();
    }
    
    // List-aware Enter behavior
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const start = textareaRef.current!.selectionStart;
      const text = block.content;
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      const currentLine = text.substring(lineStart, start);
      
      const indentMatch = currentLine.match(/^(  )*/);
      const indent = indentMatch ? indentMatch[0] : '';
      const listMatch = currentLine.match(/^\s*(\d+(\.\d+)*\.)\s(.*)$/);
      
      if (listMatch) {
        e.preventDefault();
        const content = listMatch[3].trim();
        
        if (content === '') {
          // 3.2: Enter on a blank list line -> outdent
          if (indent.length >= 2) {
            const newIndent = indent.substring(2);
            const newLine = newIndent + '1. '; // renumbering will fix
            const newText = text.substring(0, lineStart) + newLine + text.substring(start);
            const finalContent = renumberHierarchical(newText);
            onUpdate(finalContent);
            setTimeout(() => {
              if (textareaRef.current) {
                const newPos = lineStart + newLine.length;
                textareaRef.current.setSelectionRange(newPos, newPos);
              }
            }, 0);
          } else {
            // Outdent from level 1 to level 0 (plain text)
            const newText = text.substring(0, lineStart) + '' + text.substring(start);
            onUpdate(newText);
            setTimeout(() => {
              if (textareaRef.current) {
                textareaRef.current.setSelectionRange(lineStart, lineStart);
              }
            }, 0);
          }
        } else {
          // 3.1: Enter on a non-blank list line -> keep indentation
          const newText = text.substring(0, start) + '\n' + indent + '1. ' + text.substring(start);
          const finalContent = renumberHierarchical(newText);
          onUpdate(finalContent);
          setTimeout(() => {
            if (textareaRef.current) {
              // Find the new line start and position cursor after the list prefix
              const lines = finalContent.split('\n');
              const currentLineIndex = finalContent.substring(0, start).split('\n').length;
              const nextLine = lines[currentLineIndex];
              const prefixMatch = nextLine.match(/^\s*(\d+(\.\d+)*\.)\s/);
              const prefixLen = prefixMatch ? prefixMatch[0].length : 0;
              
              let newPos = 0;
              for (let i = 0; i < currentLineIndex; i++) {
                newPos += lines[i].length + 1;
              }
              newPos += prefixLen;
              textareaRef.current.setSelectionRange(newPos, newPos);
            }
          }, 0);
        }
        return;
      }
    }
    
    // Tab support
    if (e.key === 'Tab') {
      e.preventDefault();
      applyTextAction(e.shiftKey ? 'outdent' : 'indent', true);
    }
    
    // Ctrl + Arrows
    if (e.ctrlKey && e.key === 'ArrowRight') {
      e.preventDefault();
      applyTextAction('indent', true);
    }
    if (e.ctrlKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      applyTextAction('outdent', true);
    }
  };

  const applyTextAction = (action: 'bullet' | 'number' | 'indent' | 'outdent', smart = false) => {
    if (!textareaRef.current || block.isDone) return;
    
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    const text = block.content;
    
    // Find start of first line and end of last line in selection
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', end);
    const actualEnd = lineEnd === -1 ? text.length : lineEnd;
    
    const selectedText = text.substring(lineStart, actualEnd);
    const lines = selectedText.split('\n');
    
    let resultLines = [...lines];
    
    if (action === 'indent') {
      resultLines = lines.map(line => '  ' + line);
    } else if (action === 'outdent') {
      resultLines = lines.map(line => line.startsWith('  ') ? line.substring(2) : line);
    } else if (action === 'bullet') {
      resultLines = lines.map(line => line.trim().startsWith('- ') ? line.replace('- ', '') : '- ' + line.trim());
    } else if (action === 'number') {
      const isNumbered = lines.some(l => /^\s*\d+(\.\d+)*\. /.test(l));
      if (isNumbered) {
        resultLines = lines.map(l => l.replace(/^\s*\d+(\.\d+)*\. /, ''));
      } else {
        resultLines = lines.map(l => '1. ' + l.trim());
      }
    }

    const intermediateContent = text.substring(0, lineStart) + resultLines.join('\n') + text.substring(actualEnd);
    const finalContent = smart ? renumberHierarchical(intermediateContent) : intermediateContent;
    onUpdate(finalContent);
    
    // Restore focus and selection
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const diff = finalContent.length - text.length;
        
        if (start === end) {
          // If no selection, just move the cursor
          const newPos = Math.max(0, start + diff);
          textareaRef.current.setSelectionRange(newPos, newPos);
        } else {
          // If there was a selection, maintain it
          textareaRef.current.setSelectionRange(start, Math.max(start, end + diff));
        }
      }
    }, 0);
  };

  return (
    <div 
      className={cn(
        "group/block relative bg-card border border-border rounded-sm shadow-xl transition-all duration-300 overflow-hidden mt-4",
        isFocused ? "border-muted-foreground/50 ring-1 ring-muted-foreground/10" : "hover:border-muted-foreground/30",
        block.isDone && "opacity-75 grayscale-[0.5]",
        block.isThinking && "opacity-80"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Block Description / AI Label */}
      {(block.description || block.isThinking) && !isFocused && (
        <div className={cn(
          "absolute top-2 left-4 z-10 transition-all duration-300",
          isHovered ? "opacity-40 translate-y-[-2px]" : "opacity-100"
        )}>
          <div className="flex items-center gap-2 px-2 py-0.5 bg-muted/80 rounded border border-border/50 backdrop-blur-sm">
            {block.isThinking ? (
              <>
                <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-accent">AI Thinking...</span>
              </>
            ) : (
              <>
                <FileText size={10} className="text-muted-foreground" />
                <span className="text-[12px] font-medium text-muted-foreground italic">{block.description}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-10 px-3 flex items-center justify-between bg-muted/30 border-b border-border/50 z-20 transition-opacity duration-200",
        isFocused ? "opacity-100" : "opacity-0 group-hover/block:opacity-100"
      )}>
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-200",
          isFocused ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          {/* AI Expand Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7 text-accent", block.isThinking && "animate-pulse")}
                onClick={handleAIExpand}
                disabled={block.isThinking || block.isDone}
              >
                <motion.div
                  animate={block.isThinking ? { rotate: 360 } : { rotate: 0 }}
                  transition={block.isThinking ? { repeat: Infinity, duration: 2, ease: "linear" } : { duration: 0.5 }}
                >
                  <Sparkles size={14} />
                </motion.div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>AI Expand {hasSelection ? "Selection" : "Block"}</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyTextAction('bullet')} disabled={block.isDone}>
                <List size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bullet List</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyTextAction('number')} disabled={block.isDone}>
                <ListOrdered size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Numbered List</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyTextAction('indent')} disabled={block.isDone}>
                <IndentIncrease size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Indent</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => applyTextAction('outdent')} disabled={block.isDone}>
                <IndentDecrease size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Outdent</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-7 w-7", hasSelection ? "text-accent" : "text-muted-foreground/30")} 
                onClick={handleMoveToNewBlock} 
                disabled={!hasSelection}
              >
                <Scissors size={14} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{block.isDone ? "Copy selection to new block" : "Move selection to new block"}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button 
                variant={block.isDone ? "default" : "ghost"} 
                size="icon" 
                className={cn("h-7 w-7", block.isDone && "bg-accent text-accent-foreground")}
                onClick={onToggleDone}
              >
                {block.isDone ? <CheckSquare size={14} /> : <Square size={14} />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{block.isDone ? "Mark as Active" : "Mark as Done"}</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-4 mx-1" />
          <Button 
            variant="secondary" 
            size="sm" 
            className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider shadow-sm"
            onClick={handleCopy}
          >
            {isCopied ? <Check size={12} /> : 'Copy'}
          </Button>
          {canDelete && (
            <Button 
              variant="secondary" 
              size="icon" 
              className="h-7 w-7 text-muted-foreground hover:text-destructive shadow-sm"
              onClick={onDelete}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 grid-rows-1 relative">
        {/* Highlight Layer */}
        <div 
          className={cn(
            "col-start-1 row-start-1 pointer-events-none text-transparent select-none",
            sharedStyles,
            block.isDone && "grayscale-[0.5]"
          )}
          style={sharedInlineStyles}
          aria-hidden="true"
        >
          {renderHighlights()}
        </div>

        <textarea
          ref={textareaRef}
          value={block.content}
          onFocus={onFocus}
          onBlur={onBlur}
          onSelect={checkSelection}
          onMouseUp={checkSelection}
          onKeyUp={checkSelection}
          onChange={(e) => {
            onUpdate(e.target.value);
            checkSelection();
          }}
          onKeyDown={handleKeyDown}
          readOnly={block.isDone || block.isThinking}
          placeholder={block.isThinking ? "AI is processing..." : block.isDone ? "This block is marked as done." : "Begin writing your protocol..."}
          className={cn(
            "col-start-1 row-start-1 bg-transparent text-foreground/90 placeholder:text-muted-foreground/30 field-sizing-content",
            sharedStyles,
            (block.isDone || block.isThinking) && "cursor-not-allowed text-muted-foreground"
          )}
          style={sharedInlineStyles}
        />
      </div>
    </div>
  );
}

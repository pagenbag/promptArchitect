/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  FolderPlus, 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileText, 
  Copy, 
  Trash2, 
  GripVertical, 
  MoreVertical, 
  Search, 
  Settings, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Check, 
  PlusCircle,
  Sun,
  Moon,
  Edit2
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
import { Textarea } from '@/components/ui/textarea';
import { Block, Project } from './types';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'prompt_architect_data';
const THEME_KEY = 'prompt_architect_theme';

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

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [targetParentId, setTargetParentId] = useState<string | null>(null);

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
        if (parsed.length > 0 && !selectedProjectId) {
          setSelectedProjectId(parsed[0].id);
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
    }
  }, []);

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

  const selectedProject = useMemo(() => 
    projects.find(p => p.id === selectedProjectId) || null
  , [projects, selectedProjectId]);

  // Scroll to bottom when project changes
  useEffect(() => {
    if (selectedProject && scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        setTimeout(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
          // Focus the last block
          const lastBlock = selectedProject.blocks[selectedProject.blocks.length - 1];
          if (lastBlock) {
            setFocusBlockId(lastBlock.id);
          }
        }, 100);
      }
    }
  }, [selectedProjectId]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
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
    if (selectedProjectId && idsToDelete.has(selectedProjectId)) {
      setSelectedProjectId(null);
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
      b.id === blockId ? { ...b, content } : b
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
                ? "bg-accent/10 text-accent font-medium" 
                : "hover:bg-white/5 text-muted-foreground hover:text-foreground"
            )}
            style={{ paddingLeft: `${level * 16 + 12}px` }}
            onClick={() => setSelectedProjectId(item.id)}
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
                  <div className={cn("w-1 h-1 rounded-full", isSelected ? "bg-accent" : "bg-muted-foreground/30")} />
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
          className="border-right border-border flex flex-col overflow-hidden bg-muted/20"
        >
          <div className="p-6 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2 font-serif italic text-xl tracking-wider text-accent">
              <span>Architect</span>
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

          <ScrollArea className="flex-1 px-3">
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

          <div className="p-4 border-t border-border flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-accent">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent">
              <Settings size={18} />
            </Button>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-background relative">
          {!isSidebarOpen && (
            <div className="absolute left-4 top-4 z-30">
              <Button 
                variant="outline" 
                size="icon" 
                className="bg-background/80 backdrop-blur-sm border-border hover:border-accent text-muted-foreground hover:text-accent"
                onClick={() => setIsSidebarOpen(true)}
              >
                <PanelLeftOpen size={18} />
              </Button>
            </div>
          )}

          {selectedProject ? (
            <>
              <header className="py-10 px-12 border-b border-border flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-20">
                <div className="flex flex-col gap-2 overflow-hidden flex-1 mr-8">
                  <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-[2px] font-semibold">
                    <span>Projects</span>
                    <ChevronRight size={10} />
                    <span className="text-accent">{selectedProject.name}</span>
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
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Auto-save active</span>
                    <span className="text-[10px] text-muted-foreground/50">Last updated: {new Date(selectedProject.updatedAt).toLocaleTimeString()}</span>
                  </div>
                  <Separator orientation="vertical" className="h-8 mx-2 bg-border" />
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2 border-accent/30 text-accent hover:bg-accent hover:text-background transition-all duration-300"
                    onClick={handleCopyAll}
                  >
                    {isAllCopied ? <Check size={14} /> : <Copy size={14} />}
                    {isAllCopied ? 'Copied!' : 'Copy All'}
                  </Button>
                </div>
              </header>

              <ScrollArea className="flex-1" ref={scrollAreaRef}>
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
                        onAddBelow={() => addBlock(selectedProject.id, index)}
                        canDelete={selectedProject.blocks.length > 1}
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

              <footer className="h-10 border-t border-border bg-muted/30 px-12 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
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
        </main>

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
  canDelete: boolean;
}

function BlockItem({ block, isFocused, onFocus, onUpdate, onDelete, onAddBelow, canDelete }: BlockItemProps) {
  const [isCopied, setIsCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isFocused && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isFocused]);

  const handleCopy = () => {
    navigator.clipboard.writeText(block.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleKeyDown = (e: any) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      onAddBelow();
    }
  };

  return (
    <div className="group/block relative bg-card border border-border rounded-sm shadow-xl hover:border-accent transition-all duration-300 overflow-hidden">
      <div className="p-2 flex items-center justify-between bg-muted/50 border-b border-border/50 opacity-0 group-hover/block:opacity-100 transition-all duration-300">
        <div className="flex items-center gap-2 px-2">
          <GripVertical size={14} className="text-muted-foreground/50 cursor-grab active:cursor-grabbing" />
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[2px]">Section Block</span>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-6 px-3 text-[10px] font-bold uppercase tracking-wider bg-accent text-background hover:bg-accent/80 rounded-sm"
            onClick={handleCopy}
          >
            {isCopied ? <Check size={12} /> : 'Copy'}
          </Button>
          {canDelete && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 size={12} />
            </Button>
          )}
        </div>
      </div>

      <Textarea
        ref={textareaRef}
        value={block.content}
        onFocus={onFocus}
        onChange={(e) => onUpdate(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Begin writing your protocol..."
        className="min-h-[140px] border-none focus-visible:ring-0 resize-none p-8 text-lg leading-relaxed bg-transparent font-serif text-foreground/90 placeholder:text-muted-foreground/30"
      />
    </div>
  );
}

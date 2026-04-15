import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  const PROJECTS_ROOT = path.join(process.cwd(), 'projects');

  async function ensureDir(dir: string) {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  function sanitizeFilename(name: string) {
    return name.replace(/[<>:"/\\|?*]/g, '_').trim();
  }

  // API Routes
  app.get("/api/storage/status", (req, res) => {
    res.json({ isLocal: process.env.IS_LOCAL === 'true' });
  });

  app.post("/api/storage/sync", async (req, res) => {
    if (process.env.IS_LOCAL !== 'true') {
      return res.status(403).json({ error: "Local storage not enabled" });
    }

    try {
      const { projects } = req.body;
      await ensureDir(PROJECTS_ROOT);

      // Helper to get path for a project
      const getProjectPath = (project: any, allProjects: any[]) => {
        const pathParts = [];
        let current = project;
        while (current) {
          pathParts.unshift(sanitizeFilename(current.name));
          current = allProjects.find(p => p.id === current.parentId);
        }
        return path.join(PROJECTS_ROOT, ...pathParts);
      };

      const expectedFiles = new Set<string>();

      // 1. Create directories for projects that have children
      for (const project of projects) {
        const hasChildren = projects.some((p: any) => p.parentId === project.id);
        if (hasChildren) {
          const dirPath = getProjectPath(project, projects);
          await ensureDir(dirPath);
        }
      }

      // 2. Save each project as a .md file
      for (const project of projects) {
        const hasChildren = projects.some((p: any) => p.parentId === project.id);
        let filePath;
        if (hasChildren) {
          filePath = path.join(getProjectPath(project, projects), `_index.md`);
        } else {
          const parentDir = project.parentId 
            ? getProjectPath(projects.find((p: any) => p.id === project.parentId), projects)
            : PROJECTS_ROOT;
          await ensureDir(parentDir);
          filePath = path.join(parentDir, `${sanitizeFilename(project.name)}.md`);
        }

        expectedFiles.add(filePath);

        const metadata = {
          id: project.id,
          name: project.name,
          parentId: project.parentId,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          blocks: project.blocks.map((b: any) => ({
            id: b.id,
            isDone: b.isDone,
            description: b.description
          }))
        };

        const frontmatter = `---\n${yaml.dump(metadata)}---\n\n`;
        const content = project.blocks.map((b: any) => b.content).join('\n\n---\n\n');
        
        await fs.writeFile(filePath, frontmatter + content, 'utf8');
      }

      // 3. Cleanup: Remove files that are no longer expected
      async function cleanup(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await cleanup(fullPath);
            // Remove empty directories
            const remaining = await fs.readdir(fullPath);
            if (remaining.length === 0) {
              await fs.rmdir(fullPath);
            }
          } else if (entry.name.endsWith('.md')) {
            if (!expectedFiles.has(fullPath)) {
              await fs.unlink(fullPath);
            }
          }
        }
      }
      await cleanup(PROJECTS_ROOT);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/storage/load", async (req, res) => {
    if (process.env.IS_LOCAL !== 'true') {
      return res.status(403).json({ error: "Local storage not enabled" });
    }

    try {
      await ensureDir(PROJECTS_ROOT);
      const projects: any[] = [];

      async function scanDir(dir: string, parentId: string | null = null) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            // Check for _index.md
            const indexPath = path.join(fullPath, '_index.md');
            try {
              const content = await fs.readFile(indexPath, 'utf8');
              const project = parseMarkdown(content);
              projects.push(project);
              await scanDir(fullPath, project.id);
            } catch {
              // Directory without _index.md? Maybe created manually.
              // We could handle this by creating a dummy project.
            }
          } else if (entry.name.endsWith('.md') && entry.name !== '_index.md') {
            const content = await fs.readFile(fullPath, 'utf8');
            const project = parseMarkdown(content);
            projects.push(project);
          }
        }
      }

      function parseMarkdown(fileContent: string) {
        const match = fileContent.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!match) throw new Error("Invalid markdown format");
        
        const metadata: any = yaml.load(match[1]);
        const body = match[2].trim();
        const blockContents = body.split('\n\n---\n\n');
        
        const blocks = metadata.blocks.map((b: any, i: number) => ({
          ...b,
          content: blockContents[i] || ''
        }));

        return {
          ...metadata,
          blocks
        };
      }

      await scanDir(PROJECTS_ROOT);
      res.json({ projects });
    } catch (error: any) {
      console.error("Load error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

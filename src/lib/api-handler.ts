import express from "express";
import path from "path";
import fs from "fs/promises";
import yaml from "js-yaml";

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

export function setupApiRoutes(app: express.Router) {
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

      const getProjectPath = (project: any, allProjects: any[]) => {
        const pathParts = [];
        let current = project;
        while (current) {
          pathParts.unshift(sanitizeFilename(current.name));
          current = allProjects.find((p: any) => p.id === current.parentId);
        }
        return path.join(PROJECTS_ROOT, ...pathParts);
      };

      const expectedFiles = new Set<string>();

      for (const project of projects) {
        const hasChildren = projects.some((p: any) => p.parentId === project.id);
        if (hasChildren) {
          const dirPath = getProjectPath(project, projects);
          await ensureDir(dirPath);
        }
      }

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

      async function cleanup(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await cleanup(fullPath);
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
            const indexPath = path.join(fullPath, '_index.md');
            try {
              const content = await fs.readFile(indexPath, 'utf8');
              const project = parseMarkdown(content);
              projects.push(project);
              await scanDir(fullPath, project.id);
            } catch {
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
}

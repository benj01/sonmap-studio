const fs = require('fs-extra');
const path = require('path');
const { Stats } = require('fs');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = [
    'node_modules',
    '.git',
    '.next',
    '.vscode',
    'scripts'
];

const IGNORE_FILES = [
    '.DS_Store',
    'Thumbs.db',
    '.env',
    '.env.local'
];

interface FileDescription {
    name: string;
    description: string;
}

/**
 * Extracts existing file descriptions from a README.md file
 */
function extractExistingDescriptions(content: string): Map<string, string> {
    const descriptions = new Map<string, string>();
    const fileDescriptionRegex = /\| `(.+?)` \| (.+?) \|/g;
    let match;
    
    while ((match = fileDescriptionRegex.exec(content)) !== null) {
        descriptions.set(match[1], match[2].trim());
    }
    
    return descriptions;
}

/**
 * Generates the markdown content for a folder
 */
async function generateFolderMarkdown(
    folderPath: string,
    files: string[],
    existingDescriptions: Map<string, string>
): Promise<string> {
    const folderName = path.basename(folderPath);
    let content = `# 📂 ${folderName}\n\n`;
    
    content += `## Overview\n`;
    content += `This folder contains ${files.length} file(s) related to ${folderName}.\n\n`;
    
    content += `## 📄 Files in this folder\n\n`;
    content += `| File Name | Description |\n`;
    content += `|-----------|-------------|\n`;
    
    for (const file of files) {
        const description = existingDescriptions.get(file) || '[Add description]';
        content += `| \`${file}\` | ${description} |\n`;
    }
    
    content += `\n## 🔗 Dependencies\n`;
    content += `- [List important dependencies used in this folder]\n\n`;
    
    content += `## ⚙️ Usage Notes\n`;
    content += `- [Add any specific setup or initialization details]\n\n`;
    
    content += `## 🔄 Related Folders/Modules\n`;
    content += `- [List related folders or modules]\n\n`;
    
    content += `## 🚧 TODOs / Planned Improvements\n`;
    content += `- [List any pending tasks or improvements]\n`;
    
    return content;
}

/**
 * Processes a directory to generate or update its documentation
 */
async function processDirectory(dirPath: string): Promise<void> {
    try {
        const items = await fs.readdir(dirPath);
        const stats: typeof Stats[] = await Promise.all(
            items.map((item: string) => fs.stat(path.join(dirPath, item)))
        );
        
        // Filter files and directories
        const files = items.filter((item: string, index: number) => 
            stats[index].isFile() && 
            !IGNORE_FILES.includes(item) &&
            !item.startsWith('.') &&
            item !== 'README.md'
        );
        
        const dirs = items.filter((item: string, index: number) => 
            stats[index].isDirectory() && 
            !IGNORE_DIRS.includes(item) &&
            !item.startsWith('.')
        );
        
        if (files.length === 0 && dirs.length === 0) return;
        
        // Handle README.md
        const readmePath = path.join(dirPath, 'README.md');
        let existingDescriptions = new Map<string, string>();
        
        if (await fs.pathExists(readmePath)) {
            const content = await fs.readFile(readmePath, 'utf-8');
            existingDescriptions = extractExistingDescriptions(content);
        }
        
        // Generate new content
        const content = await generateFolderMarkdown(dirPath, files, existingDescriptions);
        await fs.writeFile(readmePath, content);
        
        console.log(`✅ Updated documentation for: ${path.relative(PROJECT_ROOT, dirPath)}`);
        
        // Process subdirectories
        for (const dir of dirs) {
            await processDirectory(path.join(dirPath, dir));
        }
        
    } catch (error) {
        console.error(`❌ Error processing directory ${dirPath}:`, error);
    }
}

/**
 * Main execution function
 */
async function main() {
    console.log('🚀 Starting documentation generation...\n');
    
    try {
        await processDirectory(PROJECT_ROOT);
        console.log('\n✨ Documentation generation complete!');
    } catch (error) {
        console.error('❌ Error during documentation generation:', error);
        process.exit(1);
    }
}

// Execute the script
main(); 
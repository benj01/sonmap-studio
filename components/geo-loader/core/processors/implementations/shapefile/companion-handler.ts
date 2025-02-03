import { LogManager } from '../../../logging/log-manager';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

export interface CompanionFiles {
  dbf?: string;
  shx?: string;
  prj?: string;
}

export class CompanionHandler {
  private readonly logger = LogManager.getInstance();
  private readonly LOG_SOURCE = 'CompanionHandler';

  /**
   * Find companion files for a Shapefile
   */
  public findCompanionFiles(mainFile: string): CompanionFiles {
    this.logger.debug(this.LOG_SOURCE, 'Finding companion files for', { mainFile });
    
    // Get base name and directory
    const baseName = mainFile.slice(0, -4); // Remove .shp extension
    const directory = dirname(mainFile);
    
    this.logger.debug(this.LOG_SOURCE, 'Base name and directory for companion files', { 
      baseName,
      directory,
      originalFile: mainFile
    });
    
    const companions: CompanionFiles = {};

    // Check for each companion file with both lowercase and uppercase extensions
    const extensions = [
      ['.dbf', '.DBF'],
      ['.shx', '.SHX'],
      ['.prj', '.PRJ']
    ];

    for (const [lowerExt, upperExt] of extensions) {
      // Try both lowercase and uppercase paths
      const lowerPath = join(directory, `${baseName}${lowerExt}`);
      const upperPath = join(directory, `${baseName}${upperExt}`);
      
      this.logger.debug(this.LOG_SOURCE, 'Checking companion paths', { 
        extension: lowerExt,
        lowerPath,
        upperPath,
        lowerExists: existsSync(lowerPath),
        upperExists: existsSync(upperPath)
      });

      // Check if either path exists
      if (existsSync(lowerPath)) {
        companions[lowerExt.slice(1) as keyof CompanionFiles] = lowerPath;
        this.logger.debug(this.LOG_SOURCE, 'Found companion file (lowercase)', { 
          extension: lowerExt,
          path: lowerPath
        });
      } else if (existsSync(upperPath)) {
        companions[lowerExt.slice(1) as keyof CompanionFiles] = upperPath;
        this.logger.debug(this.LOG_SOURCE, 'Found companion file (uppercase)', { 
          extension: upperExt,
          path: upperPath
        });
      } else {
        this.logger.debug(this.LOG_SOURCE, 'Companion file not found', { 
          extension: lowerExt,
          triedPaths: [lowerPath, upperPath]
        });
      }
    }

    this.logger.debug(this.LOG_SOURCE, 'Companion file search results', { 
      mainFile,
      foundCompanions: Object.keys(companions),
      companionPaths: companions
    });
    
    return companions;
  }

  /**
   * Validate required companion files
   */
  public validateCompanionFiles(mainFile: string, companions: CompanionFiles): boolean {
    this.logger.debug(this.LOG_SOURCE, 'Validating companion files', { 
      mainFile,
      companions,
      availableCompanions: Object.keys(companions)
    });
    
    // DBF and SHX are required, PRJ is optional
    const required = ['dbf', 'shx'];
    const missing = required.filter(ext => !companions[ext as keyof CompanionFiles]);

    if (missing.length > 0) {
      this.logger.warn(this.LOG_SOURCE, 'Missing required companion files', {
        mainFile,
        missing,
        available: Object.keys(companions),
        companions
      });
      return false;
    }

    // Additional validation: check if the paths actually exist
    const invalidPaths = Object.entries(companions)
      .filter(([ext, path]) => required.includes(ext) && !existsSync(path))
      .map(([ext]) => ext);

    if (invalidPaths.length > 0) {
      this.logger.warn(this.LOG_SOURCE, 'Some companion files do not exist at specified paths', {
        mainFile,
        invalidPaths,
        companions
      });
      return false;
    }

    this.logger.debug(this.LOG_SOURCE, 'All required companion files present and valid', { 
      mainFile,
      validCompanions: companions
    });
    return true;
  }

  /**
   * Get file extension from path
   */
  private getExtension(filePath: string): string {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    this.logger.debug(this.LOG_SOURCE, 'Got file extension', { filePath, extension: ext });
    return ext;
  }
} 